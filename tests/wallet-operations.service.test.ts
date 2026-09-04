// tests/wallet-operations.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

function makeBalance(amount: string) {
  return {
    amount,
    update: vi.fn().mockImplementation(function (this: any, values: any) {
      Object.assign(this, values);
      return Promise.resolve(this);
    }),
  };
}

describe('wallet-operations.service — funciones puras', () => {
  it('calculateConversion calcula fee, débito total y monto a acreditar', () => {
    const result = calculateConversion(1000, 10, 1); // 1% de comisión
    expect(result.fee).toBeCloseTo(10);
    expect(result.totalDebit).toBeCloseTo(1010);
    expect(result.destinationAmount).toBeCloseTo(100);
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

    (Currency.findOne as any).mockImplementation(({ where }: any) =>
      Promise.resolve({ code: where.code, isActive: true })
    );
    (Wallet.findOne as any).mockResolvedValue({ id: 1, userId: 42 });
    (User.findByPk as any).mockResolvedValue({ id: 42, name: 'Gisella', email: 'gisella@test.com' });
    (getExchangeRate as any).mockResolvedValue(1300); // 1 USD = 1300 ARS
    (Transaction.create as any).mockImplementation((data: any) =>
      Promise.resolve({ id: 99, ...data, transactionDate: new Date('2026-01-01T00:00:00Z') })
    );
  });

  it('ARS -> USD debita ARS + fee, acredita USD, crea la transacción como "exchange" y envía el email', async () => {
    const originBalance = makeBalance('200000');
    const destinationBalance = makeBalance('0');

    (Balance.findOne as any).mockImplementation(({ where }: any) =>
      Promise.resolve(where.currencyCode === 'ARS' ? originBalance : destinationBalance)
    );

    const result = await exchangeCurrency(42, { fromCurrency: 'ARS', toCurrency: 'USD', amount: 130000 });

    // fee = 130000 * 0.5% = 650 ; totalDebit = 130650 ; destinationAmount = 130000/1300 = 100
    expect(originBalance.update).toHaveBeenCalledWith(
      expect.objectContaining({ amount: (200000 - 130650).toFixed(8) }),
      expect.anything()
    );
    expect(destinationBalance.update).toHaveBeenCalledWith(
      expect.objectContaining({ amount: (100).toFixed(8) }),
      expect.anything()
    );

    expect(Transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'exchange',
        currencyOrigin: 'ARS',
        currencyDestination: 'USD',
        finalAmount: '100.00',
      }),
      expect.anything()
    );

    expect(mockTransaction.commit).toHaveBeenCalledTimes(1);
    expect(mockTransaction.rollback).not.toHaveBeenCalled();
    expect(sendTransactionEmail).toHaveBeenCalledTimes(1);
    expect(result.transaction.type).toBe('exchange');
    expect(result.transaction.finalAmount).toBe('100.00');
  });

  it('cualquier par sin ARS (ej. USD -> BRL) también se registra como "exchange"', async () => {
    const originBalance = makeBalance('500');
    const destinationBalance = makeBalance('0');

    (Balance.findOne as any).mockImplementation(({ where }: any) =>
      Promise.resolve(where.currencyCode === 'USD' ? originBalance : destinationBalance)
    );

    await exchangeCurrency(42, { fromCurrency: 'USD', toCurrency: 'BRL', amount: 100 });

    expect(Transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'exchange', currencyOrigin: 'USD', currencyDestination: 'BRL' }),
      expect.anything()
    );
  });

  it('rechaza la operación si el saldo de origen es insuficiente y hace rollback', async () => {
    const originBalance = makeBalance('10'); // no alcanza
    const destinationBalance = makeBalance('0');

    (Balance.findOne as any).mockImplementation(({ where }: any) =>
      Promise.resolve(where.currencyCode === 'ARS' ? originBalance : destinationBalance)
    );

    await expect(
      exchangeCurrency(42, { fromCurrency: 'ARS', toCurrency: 'USD', amount: 130000 })
    ).rejects.toThrow(/Saldo insuficiente/);

    expect(mockTransaction.rollback).toHaveBeenCalledTimes(1);
    expect(mockTransaction.commit).not.toHaveBeenCalled();
    expect(Transaction.create).not.toHaveBeenCalled();
    expect(sendTransactionEmail).not.toHaveBeenCalled();
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

    (Balance.findOne as any).mockImplementation(({ where }: any) =>
      where.currencyCode === 'ARS' ? Promise.resolve(originBalance) : Promise.resolve(null)
    );
    (Balance.create as any).mockResolvedValue(makeBalance('0'));

    await exchangeCurrency(42, { fromCurrency: 'ARS', toCurrency: 'USD', amount: 1000 });

    expect(Balance.create).toHaveBeenCalledWith(
      expect.objectContaining({ walletId: 1, currencyCode: 'USD', amount: '0' }),
      expect.anything()
    );
  });

  it('propaga ValidationError si la moneda no existe o está inactiva', async () => {
    (Currency.findOne as any).mockResolvedValueOnce(null);

    await expect(
      exchangeCurrency(42, { fromCurrency: 'ARS', toCurrency: 'XYZ', amount: 100 })
    ).rejects.toThrow(/no está disponible/);
  });

  it('formatea amount y fee de la transacción a 2 decimales aunque la DB devuelva más precisión', async () => {
    const originBalance = makeBalance('200000');
    const destinationBalance = makeBalance('0');

    (Balance.findOne as any).mockImplementation(({ where }: any) =>
      Promise.resolve(where.currencyCode === 'ARS' ? originBalance : destinationBalance)
    );

    // Simula lo que realmente devuelve Postgres: strings con 8 decimales,
    // como si la columna DECIMAL(20,8) los hubiera reformateado al leer.
    (Transaction.create as any).mockImplementation((data: any) =>
      Promise.resolve({
        id: 99,
        ...data,
        amount: '130000.00000000',
        fee: '650.00000000',
        finalAmount: '100.00000000',
        exchangeRate: '1300.00000000',
        transactionDate: new Date('2026-01-01T00:00:00Z'),
      })
    );

    const result = await exchangeCurrency(42, { fromCurrency: 'ARS', toCurrency: 'USD', amount: 130000 });

    expect(result.transaction.amount).toBe('130000.00');
    expect(result.transaction.fee).toBe('650.00');
    expect(result.transaction.finalAmount).toBe('100.00');
  });

  it('formatea exchangeRate con 4 decimales en la respuesta', async () => {
    const originBalance = makeBalance('200000');
    const destinationBalance = makeBalance('0');

    (Balance.findOne as any).mockImplementation(({ where }: any) =>
      Promise.resolve(where.currencyCode === 'ARS' ? originBalance : destinationBalance)
    );
    (getExchangeRate as any).mockResolvedValue(1508.2111);
    (Transaction.create as any).mockImplementation((data: any) =>
      Promise.resolve({
        id: 99,
        ...data,
        exchangeRate: '1508.21110000',
        transactionDate: new Date('2026-01-01T00:00:00Z'),
      })
    );

    const result = await exchangeCurrency(42, { fromCurrency: 'ARS', toCurrency: 'USD', amount: 10000 });

    expect(result.transaction.exchangeRate).toBe('1508.2111');
  });
});