// services/history.service.ts
import { Transaction } from '../models/transaction.model.js';
import { Wallet } from '../models/wallet.model.js';
import { User } from '../models/users.model.js';
import { NotFoundError } from '../errors/app-error.js';
import { Op } from 'sequelize';

export interface HistoryItem {
    id: number;
    operationType: 'carga' | 'pago' | 'cobro' | 'cambio';
    status: string;
    transactionDate: Date;
    amount: number;
    currencyCode: string;
    fee: number; // <-- NUEVO
    message?: string;
    exchangeData?: {
        currencyOrigin: string;
        currencyDestination: string;
        finalAmount: number;
    };
    counterparty?: { // <-- NUEVO
        name: string;
        alias: string;
    };
}

export async function getUserHistory(userId: number): Promise<HistoryItem[]> {
    const wallet = await Wallet.findOne({ where: { userId } });
    if (!wallet) {
        throw new NotFoundError('El usuario no tiene una wallet asociada.');
    }

    const transactions = await Transaction.findAll({
        where: {
            [Op.or]: [{ senderWalletId: wallet.id }, { receiverWalletId: wallet.id }],
        },
        order: [['transactionDate', 'DESC']],
    });

    // Resolvemos todas las contrapartes en bloque para no hacer queries N+1
    const counterpartyWalletIds = new Set<number>();
    for (const t of transactions) {
        if (t.type === 'transfer') {
            const otherWalletId = t.senderWalletId === wallet.id ? t.receiverWalletId : t.senderWalletId;
            if (otherWalletId) counterpartyWalletIds.add(otherWalletId);
        }
    }

    const counterpartyWallets = counterpartyWalletIds.size
        ? await Wallet.findAll({ where: { id: Array.from(counterpartyWalletIds) } })
        : [];
    const counterpartyUserIds = counterpartyWallets.map((w) => w.userId);
    const counterpartyUsers = counterpartyUserIds.length
        ? await User.findAll({ where: { id: counterpartyUserIds }, attributes: ['id', 'name', 'surname', 'alias'] })
        : [];

    const userById = new Map(counterpartyUsers.map((u) => [u.id, u]));
    const walletUserId = new Map(counterpartyWallets.map((w) => [w.id, w.userId]));

    // Mapeamos el modelo de Sequelize al formato limpio para el frontend
    return transactions.map((t) => {
        let operationType: 'carga' | 'pago' | 'cobro' | 'cambio';
        let amount = Number(t.amount);
        let currencyCode = t.currencyOrigin;

        if (t.type === 'deposit') {
            operationType = 'carga';
        } else if (t.type === 'exchange') {
            operationType = 'cambio';
        } else {
            if (t.senderWalletId === wallet.id) {
                operationType = 'pago';
            } else {
                operationType = 'cobro';
            }
        }

        const item: HistoryItem = {
            id: t.id as number,
            operationType,
            status: t.status,
            transactionDate: t.transactionDate as Date,
            amount,
            currencyCode,
            fee: Number(t.fee), // <-- NUEVO
            message: t.message || undefined,
        };

        if (operationType === 'cambio' && t.currencyDestination && t.finalAmount) {
            item.exchangeData = {
                currencyOrigin: t.currencyOrigin,
                currencyDestination: t.currencyDestination,
                finalAmount: Number(t.finalAmount),
            };
        }

        // Agregamos la contraparte si es transferencia
        if (operationType === 'pago' || operationType === 'cobro') {
            const otherWalletId = t.senderWalletId === wallet.id ? t.receiverWalletId : t.senderWalletId;
            const otherUserId = otherWalletId ? walletUserId.get(otherWalletId) : undefined;
            const otherUser = otherUserId ? userById.get(otherUserId) : undefined;
            if (otherUser) {
                item.counterparty = {
                    name: `${otherUser.name} ${otherUser.surname}`,
                    alias: otherUser.alias ?? ''
                };
            }
        }

        return item;
    });
}
