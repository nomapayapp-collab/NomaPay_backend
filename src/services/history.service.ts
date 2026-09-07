// services/history.service.ts
import { Op } from 'sequelize';
import { Transaction } from '../models/transaction.model.js';
import { Wallet } from '../models/wallet.model.js';
import { NotFoundError } from '../errors/app-error.js';

export interface HistoryItem {
    id: number;
    operationType: 'carga' | 'pago' | 'cobro' | 'cambio';
    status: string;
    transactionDate: Date;
    amount: number;
    currencyCode: string;
    exchangeData?: {
        currencyOrigin: string;
        currencyDestination: string;
        finalAmount: number;
    };
}

export async function getUserHistory(userId: number): Promise<HistoryItem[]> {
    const wallet = await Wallet.findOne({ where: { userId } });
    if (!wallet) {
        throw new NotFoundError('Este usuario no tiene una wallet asociada.');
    }

    // Buscamos todas las transacciones donde nuestra wallet esté involucrada
    const transactions = await Transaction.findAll({
        where: {
            [Op.or]: [{ senderWalletId: wallet.id }, { receiverWalletId: wallet.id }],
        },
        order: [['transaction_date', 'DESC']], // De la más nueva a la más vieja
    });

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
            // Si es una transferencia, nos fijamos si la enviamos o la recibimos
            if (t.senderWalletId === wallet.id) {
                operationType = 'pago';  // Salió plata
            } else {
                operationType = 'cobro'; // Entró plata
            }
        }

        const item: HistoryItem = {
            id: t.id as number,
            operationType,
            status: t.status,
            transactionDate: t.transactionDate as Date,
            amount,
            currencyCode,
        };

        // Si fue un cambio, agregamos la info extra de conversión
        if (operationType === 'cambio' && t.currencyDestination && t.finalAmount) {
            item.exchangeData = {
                currencyOrigin: t.currencyOrigin,
                currencyDestination: t.currencyDestination,
                finalAmount: Number(t.finalAmount),
            };
        }

        return item;
    });
}
