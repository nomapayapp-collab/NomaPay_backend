
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { FindOptions } from 'sequelize';
import type { Wallet as WalletModel } from '../src/models/wallet.model.js';
import type { Balance as BalanceModel } from '../src/models/balance.model.js';
import type { Currency as CurrencyModel } from '../src/models/currency.model.js';
import type { Transaction as TransactionModel } from '../src/models/transaction.model.js';
import type { User as UserModel } from '../src/models/users.model.js';

const mockTransaction = {
    LOCK: { UPDATE: 'UPDATE' },
    commit: vi.fn(),
    rollback: vi.fn(),
};

vi.mock('../src/db.js', () => ({
    default: {
        transaction: vi.fn(async () => mockTransaction),
    },
}));

vi.mock('../src/models/wallet.model.js', () => ({
    Wallet: { findOne: vi.fn() },
}));

vi.mock('../src/models/balance.model.js', () => ({
    Balance: { findOne: vi.fn(), create: vi.fn() },
}));

vi.mock('../src/models/currency.model.js', () => ({
    Currency: { findOne: vi.fn(), findAll: vi.fn() },
}));

vi.mock('../src/models/transaction.model.js', () => ({
    Transaction: { create: vi.fn() },
}));

vi.mock('../src/models/users.model.js', () => ({
    User: { findByPk: vi.fn() },
}));

vi.mock('../src/services/exchange-rate.service.js', () => ({
    getExchangeRate: vi.fn(),
}));

vi.mock('../src/mails/mail.js', () => ({
    sendTransactionEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/services/wallet.service.js', () => ({
    getWalletSummary: vi.fn().mockResolvedValue({
        walletId: 1,
        preferredCurrency: 'ARS',
        balances: [],
    }),
}));

const { Wallet } = await import('../src/models/wallet.model.js');
const { Balance } = await import('../src/models/balance.model.js');
const { Currency } = await import('../src/models/currency.model.js');
const { Transaction } = await import('../src/models/transaction.model.js');
const { User } = await import('../src/models/users.model.js');
const { getExchangeRate } = await import('../src/services/exchange-rate.service.js');
const { sendTransactionEmail } = await import('../src/mails/mail.js');

const { exchangeCurrency, calculateConversion, round2 } = await import(
    '../src/services/wallet-operations.service.js'
);


interface FakeBalance {
    amount: string;
    update: Mock;
}

function makeBalance(amount: string): FakeBalance {
    const balance: FakeBalance = {
        amount,
        update: vi.fn(),
    };
    balance.update.mockImplementation((values: Partial<FakeBalance>) => {
        Object.assign(balance, values);
        return Promise.resolve(balance);
    });
    return balance;
}

function asWallet(partial: Record<string, unknown>): WalletModel {
    return partial as unknown as WalletModel;
}
function asBalance(partial: FakeBalance | null): BalanceModel | null {
    return partial as unknown as BalanceModel | null;
}
function asCurrency(partial: Record<string, unknown>): CurrencyModel {
    return partial as unknown as CurrencyModel;
}
function asTransaction(partial: Record<string, unknown>): TransactionModel {
    return partial as unknown as TransactionModel;
}
function asUser(partial: Record<string, unknown>): UserModel {
    return partial as unknown as UserModel;
}


function whereOf(options: FindOptions | undefined): Record<string, unknown> {
    return (options?.where ?? {}) as Record<string, unknown>;
}

describe('wallet-operations.service — funciones puras', () => {
    it('calculateConversion calcula fee, débito total y monto a acreditar', () => {
        const result = calculateConversion(1000, 10, 1); // 1% de comisión
        expect(result.fee).toBeCloseTo(10);
        expect(result.totalDebit).toBeCloseTo(1000);
        expect(result.destinationAmount).toBeCloseTo(99);
    });

    it('round2 redondea correctamente a 2 decimales', () => {
        expect(round2(99.995)).toBe('100.00');
        expect(round2(1)).toBe('1.00');
    });

    it('round2 también acepta un string (como vienen los DECIMAL de Postgres)', () => {
        expect(round2('6.63037157')).toBe('6.63');
        expect(round2('489950.00000000')).toBe('489950.00');
    });
});

describe('wallet-operations.service — exchangeCurrency (integración con mocks)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockTransaction.commit.mockReset();
        mockTransaction.rollback.mockReset();

        vi.mocked(Currency.findOne).mockImplementation((options) => {
            const where = whereOf(options);
            return Promise.resolve(asCurrency({ code: where.code, isActive: true }));
        });
        vi.mocked(Wallet.findOne).mockResolvedValue(asWallet({ id: 1, userId: 42 }));
        vi.mocked(User.findByPk).mockResolvedValue(asUser({ id: 42, name: 'Gisella', email: 'gisella@test.com' }));
        vi.mocked(getExchangeRate).mockResolvedValue(1300);
        vi.mocked(Transaction.create).mockImplementation((data) =>
            Promise.resolve(asTransaction({ id: 99, ...data, transactionDate: new Date('2026-01-01T00:00:00Z') }))
        );
    });

    it('ARS -> USD debita ARS exactos, resta fee al convertido, acredita USD, crea la transacción como "exchange" y envía el email', async () => {
        const originBalance = makeBalance('200000');
        const destinationBalance = makeBalance('0');

        vi.mocked(Balance.findOne).mockImplementation((options) => {
            const where = whereOf(options);
            return Promise.resolve(asBalance(where.currencyCode === 'ARS' ? originBalance : destinationBalance));
        });

        const result = await exchangeCurrency(42, { fromCurrency: 'ARS', toCurrency: 'USD', amount: 130000 });


        expect(originBalance.update).toHaveBeenCalledWith(
            expect.objectContaining({ amount: (200000 - 130000).toFixed(8) }),
            expect.anything()
        );
        expect(destinationBalance.update).toHaveBeenCalledWith(
            expect.objectContaining({ amount: (99.5).toFixed(8) }),
            expect.anything()
        );

        expect(Transaction.create).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'exchange',
                currencyOrigin: 'ARS',
                currencyDestination: 'USD',
                finalAmount: '99.50',
            }),
            expect.anything()
        );

        expect(mockTransaction.commit).toHaveBeenCalledTimes(1);
        expect(mockTransaction.rollback).not.toHaveBeenCalled();
        expect(sendTransactionEmail).toHaveBeenCalledTimes(1);
        expect(result.transaction.type).toBe('exchange');
        expect(result.transaction.finalAmount).toBe('99.50');
    });

    it('cualquier par sin ARS (ej. USD -> BRL) también se registra como "exchange"', async () => {
        const originBalance = makeBalance('500');
        const destinationBalance = makeBalance('0');

        vi.mocked(Balance.findOne).mockImplementation((options) => {
            const where = whereOf(options);
            return Promise.resolve(asBalance(where.currencyCode === 'USD' ? originBalance : destinationBalance));
        });

        await exchangeCurrency(42, { fromCurrency: 'USD', toCurrency: 'BRL', amount: 100 });

        expect(Transaction.create).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'exchange', currencyOrigin: 'USD', currencyDestination: 'BRL' }),
            expect.anything()
        );
    });

    it('rechaza la operación si el saldo de origen es insuficiente y hace rollback', async () => {
        const originBalance = makeBalance('10');
        const destinationBalance = makeBalance('0');

        vi.mocked(Balance.findOne).mockImplementation((options) => {
            const where = whereOf(options);
            return Promise.resolve(asBalance(where.currencyCode === 'ARS' ? originBalance : destinationBalance));
        });

        await expect(
            exchangeCurrency(42, { fromCurrency: 'ARS', toCurrency: 'USD', amount: 130000 })
        ).rejects.toThrow(/Saldo insuficiente/);

        expect(mockTransaction.rollback).toHaveBeenCalledTimes(1);
        expect(mockTransaction.commit).not.toHaveBeenCalled();
        expect(Transaction.create).not.toHaveBeenCalled();
        expect(sendTransactionEmail).not.toHaveBeenCalled();
    });

    it('permite la conversión si la diferencia con el saldo es menor a 1 centavo (tolerancia de redondeo)', async () => {

        const originBalance = makeBalance('140692814.12749246');
        const destinationBalance = makeBalance('0');

        vi.mocked(Balance.findOne).mockImplementation((options) => {
            const where = whereOf(options);
            return Promise.resolve(asBalance(where.currencyCode === 'ARS' ? originBalance : destinationBalance));
        });

        await exchangeCurrency(42, { fromCurrency: 'ARS', toCurrency: 'USD', amount: 140692814.13 });


        expect(originBalance.update).toHaveBeenCalledWith(
            expect.objectContaining({ amount: '0.00000000' }),
            expect.anything()
        );
        expect(mockTransaction.commit).toHaveBeenCalledTimes(1);
    });


    it('rechaza montos <= 0 sin llegar a abrir una transacción de DB', async () => {
        await expect(
            exchangeCurrency(42, { fromCurrency: 'ARS', toCurrency: 'USD', amount: 0 })
        ).rejects.toThrow(/mayor a 0/);
        await expect(
            exchangeCurrency(42, { fromCurrency: 'ARS', toCurrency: 'USD', amount: -5 })
        ).rejects.toThrow(/mayor a 0/);
    });

    it('rechaza cuando origen y destino son la misma moneda', async () => {
        await expect(
            exchangeCurrency(42, { fromCurrency: 'ARS', toCurrency: 'ARS', amount: 100 })
        ).rejects.toThrow(/no pueden ser la misma/);
    });

    it('crea el balance destino en 0 si todavía no existía (moneda activada después del registro)', async () => {
        const originBalance = makeBalance('200000');

        vi.mocked(Balance.findOne).mockImplementation((options) => {
            const where = whereOf(options);
            return where.currencyCode === 'ARS' ? Promise.resolve(asBalance(originBalance)) : Promise.resolve(null);
        });
        vi.mocked(Balance.create).mockResolvedValue(asBalance(makeBalance('0')) as BalanceModel);

        await exchangeCurrency(42, { fromCurrency: 'ARS', toCurrency: 'USD', amount: 1000 });

        expect(Balance.create).toHaveBeenCalledWith(
            expect.objectContaining({ walletId: 1, currencyCode: 'USD', amount: '0' }),
            expect.anything()
        );
    });

    it('propaga ValidationError si la moneda no existe o está inactiva', async () => {
        vi.mocked(Currency.findOne).mockResolvedValueOnce(null);

        await expect(
            exchangeCurrency(42, { fromCurrency: 'ARS', toCurrency: 'XYZ', amount: 100 })
        ).rejects.toThrow(/no está disponible/);
    });

    it('formatea amount y fee de la transacción a 2 decimales aunque la DB devuelva más precisión', async () => {
        const originBalance = makeBalance('200000');
        const destinationBalance = makeBalance('0');

        vi.mocked(Balance.findOne).mockImplementation((options) => {
            const where = whereOf(options);
            return Promise.resolve(asBalance(where.currencyCode === 'ARS' ? originBalance : destinationBalance));
        });

        vi.mocked(Transaction.create).mockImplementation((data) =>
            Promise.resolve(asTransaction({
                id: 99,
                ...data,
                amount: '130000.00000000',
                fee: '650.00000000',
                finalAmount: '99.50000000',
                exchangeRate: '1300.00000000',
                transactionDate: new Date('2026-01-01T00:00:00Z'),
            }))
        );

        const result = await exchangeCurrency(42, { fromCurrency: 'ARS', toCurrency: 'USD', amount: 130000 });

        expect(result.transaction.amount).toBe('130000.00');
        expect(result.transaction.fee).toBe('650.00');
        expect(result.transaction.finalAmount).toBe('99.50');
    });

    it('formatea exchangeRate con 4 decimales en la respuesta', async () => {
        const originBalance = makeBalance('200000');
        const destinationBalance = makeBalance('0');

        vi.mocked(Balance.findOne).mockImplementation((options) => {
            const where = whereOf(options);
            return Promise.resolve(asBalance(where.currencyCode === 'ARS' ? originBalance : destinationBalance));
        });
        vi.mocked(getExchangeRate).mockResolvedValue(1508.2111);
        vi.mocked(Transaction.create).mockImplementation((data) =>
            Promise.resolve(asTransaction({
                id: 99,
                ...data,
                exchangeRate: '1508.21110000',
                transactionDate: new Date('2026-01-01T00:00:00Z'),
            }))
        );

        const result = await exchangeCurrency(42, { fromCurrency: 'ARS', toCurrency: 'USD', amount: 10000 });

        expect(result.transaction.exchangeRate).toBe('1508.2111');
    });
});