// services/transfer.service.ts
import { Op } from 'sequelize';
import sequelize from '../db.js';
import { User } from '../models/users.model.js';
import { Wallet } from '../models/wallet.model.js';
import { Balance } from '../models/balance.model.js';
import { Transaction } from '../models/transaction.model.js';
import { NotFoundError, ValidationError } from '../errors/app-error.js';
import { assertActiveCurrency } from './wallet-operations.service.js';
import { sendTransactionEmail } from '../mails/mail.js';
import { round2 } from '../utils/money.util.js';

export interface TransferInput {
    aliasOrCbu: string;
    currencyCode: string;
    amount: number;
}

export async function transferFunds(senderId: number, input: TransferInput) {
    const currencyCode = input.currencyCode.toUpperCase();
    const amount = Number(input.amount);

    await assertActiveCurrency(currencyCode);

    const t = await sequelize.transaction();
    let committed = false;

    try {
        // 1. Validar y obtener el usuario receptor por su Alias O CBU
        const receiverUser = await User.findOne({
            where: {
                [Op.or]: [{ alias: input.aliasOrCbu }, { cbu: input.aliasOrCbu }],
            },
            transaction: t,
        });

        if (!receiverUser) {
            throw new NotFoundError('No se encontró ningún usuario con ese alias o CBU.');
        }

        if (receiverUser.id === senderId) {
            throw new ValidationError('No podés transferirte dinero a vos mismo por esta vía.');
        }

        // 2. Obtener wallets bloqueándolas para evitar problemas de concurrencia
        const senderWallet = await Wallet.findOne({
            where: { userId: senderId },
            transaction: t,
            lock: t.LOCK.UPDATE,
        });
        if (!senderWallet) throw new NotFoundError('No tenés una wallet asociada.');

        const receiverWallet = await Wallet.findOne({
            where: { userId: receiverUser.id },
            transaction: t,
            lock: t.LOCK.UPDATE,
        });
        if (!receiverWallet) throw new NotFoundError('El usuario destino no tiene wallet activa.');

        // 3. Verificar y descontar saldo del emisor
        const senderBalance = await Balance.findOne({
            where: { walletId: senderWallet.id, currencyCode },
            transaction: t,
            lock: t.LOCK.UPDATE,
        });

        if (!senderBalance || Number(senderBalance.amount) < amount) {
            throw new ValidationError(`Saldo insuficiente. Tenés ${senderBalance ? senderBalance.amount : 0} ${currencyCode}.`);
        }

        await senderBalance.update({
            amount: (Number(senderBalance.amount) - amount).toFixed(8),
            updatedAt: new Date(),
        }, { transaction: t });

        // 4. Sumar saldo al receptor
        let receiverBalance = await Balance.findOne({
            where: { walletId: receiverWallet.id, currencyCode },
            transaction: t,
            lock: t.LOCK.UPDATE,
        });

        if (!receiverBalance) {
            // Si el receptor no tenía balance en esta moneda, se lo creamos en 0 primero
            receiverBalance = await Balance.create(
                { walletId: receiverWallet.id, currencyCode, amount: '0' },
                { transaction: t }
            );
        }

        await receiverBalance.update({
            amount: (Number(receiverBalance.amount) + amount).toFixed(8),
            updatedAt: new Date(),
        }, { transaction: t });

        // 5. Registrar la transacción de transferencia
        const createdTransaction = await Transaction.create({
            senderWalletId: senderWallet.id,
            receiverWalletId: receiverWallet.id,
            type: 'transfer',
            status: 'completed',
            currencyOrigin: currencyCode,
            currencyDestination: null,
            amount: amount.toFixed(8),
            fee: '0',
            finalAmount: amount.toFixed(8),
            exchangeRate: null,
        }, { transaction: t });

        await t.commit();
        committed = true;

        // 6. Enviar emails
        /* const senderUser = await User.findByPk(senderId);
         if (senderUser) {
             sendTransactionEmail(senderUser, {
                 currencyCode,
                 amount: round2(amount),
                 transactionDate: createdTransaction.transactionDate,
             }).catch(err => console.error('Error email emisor:', err));
         }*/

        return {
            message: 'Transferencia exitosa',
            transaction: {
                id: createdTransaction.id as number,
                receiverName: `${receiverUser.name} ${receiverUser.surname}`,
                receiverAlias: receiverUser.alias,
                amount: round2(amount),
                currencyCode,
                transactionDate: createdTransaction.transactionDate as Date,
            }
        };
    } catch (err) {
        if (!committed) await t.rollback();
        throw err;
    }
}
