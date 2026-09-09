import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Wallet as WalletModel } from '../src/models/wallet.model.js';
import type { Transaction as TransactionModel } from '../src/models/transaction.model.js';
import type { User as UserModel } from '../src/models/users.model.js';

vi.mock('../src/models/wallet.model.js', () => ({
    Wallet: { findOne: vi.fn(), findAll: vi.fn() },
}));

vi.mock('../src/models/transaction.model.js', () => ({
    Transaction: { findAll: vi.fn() },
}));

vi.mock('../src/models/users.model.js', () => ({
    User: { findAll: vi.fn() },
}));

const { Wallet } = await import('../src/models/wallet.model.js');
const { Transaction } = await import('../src/models/transaction.model.js');
const { User } = await import('../src/models/users.model.js');

const { getUserHistory } = await import('../src/services/history.service.js');

const USER_ID = 1;
const MY_WALLET = { id: 10, userId: USER_ID };

function asWallet(partial: Record<string, unknown>): WalletModel {
    return partial as unknown as WalletModel;
}
function asWallets(partials: Record<string, unknown>[]): WalletModel[] {
    return partials as unknown as WalletModel[];
}
function asTransactions(partials: Record<string, unknown>[]): TransactionModel[] {
    return partials as unknown as TransactionModel[];
}
function asUsers(partials: Record<string, unknown>[]): UserModel[] {
    return partials as unknown as UserModel[];
}

describe('history.service — getUserHistory', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('lanza NotFoundError si el usuario no tiene una wallet asociada', async () => {
        vi.mocked(Wallet.findOne).mockResolvedValue(null);

        await expect(getUserHistory(USER_ID)).rejects.toThrow(
            'El usuario no tiene una wallet asociada.'
        );
    });

    it('retorna array vacío si el usuario no tiene movimientos', async () => {
        vi.mocked(Wallet.findOne).mockResolvedValue(asWallet(MY_WALLET));
        vi.mocked(Transaction.findAll).mockResolvedValue(asTransactions([]));

        const history = await getUserHistory(USER_ID);

        expect(history).toEqual([]);
    });

    it('mapea depósitos a "carga" con su fee y sin contraparte', async () => {
        vi.mocked(Wallet.findOne).mockResolvedValue(asWallet(MY_WALLET));
        vi.mocked(Transaction.findAll).mockResolvedValue(asTransactions([
            {
                id: 101,
                type: 'deposit',
                status: 'completed',
                transactionDate: new Date('2026-09-01T12:00:00Z'),
                amount: '5000.00000000',
                fee: '25.00000000',
                currencyOrigin: 'ARS',
                message: null,
            },
        ]));

        const history = await getUserHistory(USER_ID);

        expect(history).toHaveLength(1);
        expect(history[0]).toEqual({
            id: 101,
            operationType: 'carga',
            status: 'completed',
            transactionDate: new Date('2026-09-01T12:00:00Z'),
            amount: 5000,
            currencyCode: 'ARS',
            fee: 25,
            message: undefined,
        });
    });

    it('mapea exchange a "cambio" con exchangeData', async () => {
        vi.mocked(Wallet.findOne).mockResolvedValue(asWallet(MY_WALLET));
        vi.mocked(Transaction.findAll).mockResolvedValue(asTransactions([
            {
                id: 102,
                type: 'exchange',
                status: 'completed',
                transactionDate: new Date('2026-09-02T12:00:00Z'),
                amount: '130000.00000000',
                fee: '650.00000000',
                currencyOrigin: 'ARS',
                currencyDestination: 'USD',
                finalAmount: '100.00000000',
                message: null,
            },
        ]));

        const history = await getUserHistory(USER_ID);

        expect(history).toHaveLength(1);
        expect(history[0]).toEqual({
            id: 102,
            operationType: 'cambio',
            status: 'completed',
            transactionDate: new Date('2026-09-02T12:00:00Z'),
            amount: 130000,
            currencyCode: 'ARS',
            fee: 650,
            message: undefined,
            exchangeData: {
                currencyOrigin: 'ARS',
                currencyDestination: 'USD',
                finalAmount: 100,
            },
        });
    });

    it('mapea transferencias enviadas como "pago" y recibidas como "cobro" con su counterparty y message', async () => {
        vi.mocked(Wallet.findOne).mockResolvedValue(asWallet(MY_WALLET));


        vi.mocked(Transaction.findAll).mockResolvedValue(asTransactions([
            {
                id: 103,
                type: 'transfer',
                status: 'completed',
                transactionDate: new Date('2026-09-03T15:00:00Z'),
                senderWalletId: MY_WALLET.id,
                receiverWalletId: 20,
                amount: '1500.00000000',
                fee: '0.00000000',
                currencyOrigin: 'ARS',
                message: 'Para la pizza 🍕',
            },
            {
                id: 104,
                type: 'transfer',
                status: 'completed',
                transactionDate: new Date('2026-09-04T18:00:00Z'),
                senderWalletId: 30,
                receiverWalletId: MY_WALLET.id,
                amount: '3000.00000000',
                fee: '0.00000000',
                currencyOrigin: 'ARS',
                message: null,
            },
        ]));

        vi.mocked(Wallet.findAll).mockResolvedValue(asWallets([
            { id: 20, userId: 2 },
            { id: 30, userId: 3 },
        ]));

        vi.mocked(User.findAll).mockResolvedValue(asUsers([
            { id: 2, name: 'María', surname: 'Gómez', alias: 'maria.gomez' },
            { id: 3, name: 'Juan', surname: 'Pérez', alias: 'juan.perez' },
        ]));

        const history = await getUserHistory(USER_ID);

        expect(history).toHaveLength(2);


        expect(history[0]).toEqual({
            id: 103,
            operationType: 'pago',
            status: 'completed',
            transactionDate: new Date('2026-09-03T15:00:00Z'),
            amount: 1500,
            currencyCode: 'ARS',
            fee: 0,
            message: 'Para la pizza 🍕',
            counterparty: {
                name: 'María Gómez',
                alias: 'maria.gomez',
            },
        });


        expect(history[1]).toEqual({
            id: 104,
            operationType: 'cobro',
            status: 'completed',
            transactionDate: new Date('2026-09-04T18:00:00Z'),
            amount: 3000,
            currencyCode: 'ARS',
            fee: 0,
            message: undefined,
            counterparty: {
                name: 'Juan Pérez',
                alias: 'juan.perez',
            },
        });
    });
});