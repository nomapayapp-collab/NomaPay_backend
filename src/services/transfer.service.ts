
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
    message?: string;
}

export async function transferFunds(senderId: number, input: TransferInput) {
    const currencyCode = input.currencyCode.toUpperCase();
    const amount = Number(input.amount);

    await assertActiveCurrency(currencyCode);

    const t = await sequelize.transaction();
    let committed = false;

    try {

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


        let receiverBalance = await Balance.findOne({
            where: { walletId: receiverWallet.id, currencyCode },
            transaction: t,
            lock: t.LOCK.UPDATE,
        });

        if (!receiverBalance) {

            receiverBalance = await Balance.create(
                { walletId: receiverWallet.id, currencyCode, amount: '0' },
                { transaction: t }
            );
        }

        await receiverBalance.update({
            amount: (Number(receiverBalance.amount) + amount).toFixed(8),
            updatedAt: new Date(),
        }, { transaction: t });


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
            message: input.message || null,
        }, { transaction: t });

        await t.commit();
        committed = true;


        const senderUser = await User.findByPk(senderId);
        if (senderUser) {
            sendTransactionEmail(senderUser, {
                type: 'transfer',
                operationNumber: `NP-${createdTransaction.id}`,
                amount: round2(amount),
                fee: '0.00',
                finalAmount: round2(amount),
                currencyOrigin: currencyCode,
                currencyDestination: currencyCode,
                transactionDate: createdTransaction.transactionDate,
                role: 'sender',
                counterpartyName: `${receiverUser.name} ${receiverUser.surname}`.trim(),
                counterpartyAlias: receiverUser.alias ?? '—',
                sourceAccount: `Saldo en ${currencyCode}`,
            }).catch((err) => console.error('❌ Error enviando email al emisor de la transferencia:', err));
        }


        sendTransactionEmail(receiverUser, {
            type: 'transfer',
            operationNumber: `NP-${createdTransaction.id}`,
            amount: round2(amount),
            fee: '0.00',
            finalAmount: round2(amount),
            currencyOrigin: currencyCode,
            currencyDestination: currencyCode,
            transactionDate: createdTransaction.transactionDate,
            role: 'receiver',
            counterpartyName: senderUser ? `${senderUser.name} ${senderUser.surname}`.trim() : 'Usuario NomaPay',
            destinationAccount: `Saldo en ${currencyCode}`,
        }).catch((err) => console.error('❌ Error enviando email al receptor de la transferencia:', err));


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