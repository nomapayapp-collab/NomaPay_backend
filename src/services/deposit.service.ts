// services/deposit.service.ts
//
// Carga de dinero falso a la wallet del usuario, en la moneda que elija.
// A diferencia de convertCurrency (buy/sell/exchange), acá no hay conversión ni
// tasa de cambio: es plata que "aparece" en un solo balance. No se cobra comisión.
//
// Tope por carga: MAX_DEPOSIT_AMOUNT (por defecto 1.000.000), configurable por
// .env, para que no se pueda simular un monto absurdo de un solo golpe.

import sequelize from '../db.js';
import { Wallet } from '../models/wallet.model.js';
import { Balance } from '../models/balance.model.js';
import { Transaction } from '../models/transaction.model.js';
import { User } from '../models/users.model.js';
import { NotFoundError, ValidationError } from '../errors/app-error.js';
import { assertActiveCurrency } from './wallet-operations.service.js';
import { sendTransactionEmail } from '../mails/mail.js';
import { getWalletSummary } from './wallet.service.js';
import type { WalletSummary } from './wallet.service.js';
import { round2 } from '../utils/money.util.js';

export const MAX_DEPOSIT_AMOUNT = Number(process.env.MAX_DEPOSIT_AMOUNT ?? 1_000_000);

export interface DepositInput {
    currencyCode: string;
    amount: number;
}

export interface DepositResult {
    transaction: {
        id: number;
        type: 'deposit';
        status: string;
        currencyCode: string;
        amount: string;
        transactionDate: Date;
    };
    wallet: WalletSummary;
}

/**
 * Carga dinero falso en la moneda elegida. Suma directo al balance existente
 * (o lo crea en 0 primero, si por algún motivo todavía no existía) dentro de
 * una transacción de DB con lock, para evitar condiciones de carrera si el
 * usuario dispara dos cargas casi al mismo tiempo.
 */
export async function depositFunds(userId: number, input: DepositInput): Promise<DepositResult> {
    const currencyCode = input.currencyCode.toUpperCase();
    const amount = Number(input.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
        throw new ValidationError('El monto debe ser un número mayor a 0.');
    }
    if (amount > MAX_DEPOSIT_AMOUNT) {
        throw new ValidationError(
            `El monto máximo por carga es ${round2(MAX_DEPOSIT_AMOUNT)} ${currencyCode}.`
        );
    }

    await assertActiveCurrency(currencyCode);

    const t = await sequelize.transaction();
    let committed = false;

    try {
        const wallet = await Wallet.findOne({
            where: { userId },
            transaction: t,
            lock: t.LOCK.UPDATE,
        });
        if (!wallet) {
            throw new NotFoundError('Este usuario no tiene una wallet asociada.');
        }

        let balance = await Balance.findOne({
            where: { walletId: wallet.id, currencyCode },
            transaction: t,
            lock: t.LOCK.UPDATE,
        });
        if (!balance) {
            balance = await Balance.create(
                { walletId: wallet.id, currencyCode, amount: '0' },
                { transaction: t }
            );
        }

        await balance.update(
            {
                amount: (Number(balance.amount) + amount).toFixed(8),
                updatedAt: new Date(),
            },
            { transaction: t }
        );

        const createdTransaction = await Transaction.create(
            {
                senderWalletId: wallet.id,
                receiverWalletId: wallet.id,
                type: 'deposit',
                status: 'completed',
                currencyOrigin: currencyCode,
                currencyDestination: null,
                amount: amount.toFixed(8),
                fee: '0',
                finalAmount: amount.toFixed(8),
                exchangeRate: null,
            },
            { transaction: t }
        );

        await t.commit();
        committed = true;
        /*
            const user = await User.findByPk(userId);
            if (user) {
              sendTransactionEmail(user, {
                currencyCode,
                amount: round2(amount),
                transactionDate: createdTransaction.transactionDate,
              }).catch((err) => console.error('❌ Error enviando email de depósito:', err));
            }
        */
        const walletSummary = await getWalletSummary(userId);

        return {
            transaction: {
                id: createdTransaction.id,
                type: 'deposit',
                status: createdTransaction.status,
                currencyCode: createdTransaction.currencyOrigin,
                amount: round2(createdTransaction.amount),
                transactionDate: createdTransaction.transactionDate,
            },
            wallet: walletSummary,
        };
    } catch (err) {
        if (!committed) {
            await t.rollback();
        }
        throw err;
    }

}