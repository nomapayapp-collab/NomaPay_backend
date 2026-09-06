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

vi.mock('../src/models/transaction.model.js', () => ({
  Transaction: { create: vi.fn() },
}));

vi.mock('../src/models/users.model.js', () => ({
  User: { findByPk: vi.fn() },
}));

vi.mock('../src/services/wallet-operations.service.js', () => ({
  assertActiveCurrency: vi.fn(),
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
const { Transaction } = await import('../src/models/transaction.model.js');
const { assertActiveCurrency } = await import('../src/services/wallet-operations.service.js');
const { sendTransactionEmail } = await import('../src/mails/mail.js');
const { getWalletSummary } = await import('../src/services/wallet.service.js');

const { depositFunds, DEPOSIT_LIMITS, DEFAULT_MAX_DEPOSIT_AMOUNT } = await import('../src/services/deposit.service.js');

function makeBalance(amount: string) {
  return {
    amount,
    update: vi.fn().mockImplementation(function (this: any, values: any) {
      Object.assign(this, values);
      return Promise.resolve(this);
    }),
  };
}

describe('deposit.service — depositFunds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.commit.mockReset();
    mockTransaction.rollback.mockReset();

    (assertActiveCurrency as any).mockResolvedValue({ code: 'ARS', isActive: true });
    (Wallet.findOne as any).mockResolvedValue({ id: 1, userId: 42 });
    (Transaction.create as any).mockImplementation((data: any) =>
      Promise.resolve({ id: 99, ...data, transactionDate: new Date('2026-01-01T00:00:00Z') })
    );
  });

  it('rechaza montos <= 0 sin abrir una transacción de DB', async () => {
    await expect(depositFunds(42, { currencyCode: 'ARS', amount: 0 })).rejects.toThrow(/mayor a 0/);
    await expect(depositFunds(42, { currencyCode: 'ARS', amount: -100 })).rejects.toThrow(/mayor a 0/);
    expect(Wallet.findOne).not.toHaveBeenCalled();
  });

  it('rechaza montos no numéricos (NaN/Infinity)', async () => {
    await expect(depositFunds(42, { currencyCode: 'ARS', amount: NaN })).rejects.toThrow(/mayor a 0/);
  });

  it(`rechaza montos por encima del límite de ARS (${DEPOSIT_LIMITS.ARS})`, async () => {
    await expect(
      depositFunds(42, { currencyCode: 'ARS', amount: DEPOSIT_LIMITS.ARS + 1 })
    ).rejects.toThrow(/monto máximo por carga en ARS/);
  });

  it('acepta un monto exactamente igual al límite de ARS', async () => {
    const balance = makeBalance('0');
    (Balance.findOne as any).mockResolvedValue(balance);

    await expect(
      depositFunds(42, { currencyCode: 'ARS', amount: DEPOSIT_LIMITS.ARS })
    ).resolves.toBeDefined();
  });

  it(`rechaza montos por encima del límite de USD (${DEPOSIT_LIMITS.USD})`, async () => {
    await expect(
      depositFunds(42, { currencyCode: 'USD', amount: DEPOSIT_LIMITS.USD + 1 })
    ).rejects.toThrow(/monto máximo por carga en USD/);
  });

  it('acepta un monto exactamente igual al límite de USD', async () => {
    const balance = makeBalance('0');
    (Balance.findOne as any).mockResolvedValue(balance);

    await expect(
      depositFunds(42, { currencyCode: 'USD', amount: DEPOSIT_LIMITS.USD })
    ).resolves.toBeDefined();
  });

  it(`rechaza montos por encima del límite de BRL (${DEPOSIT_LIMITS.BRL})`, async () => {
    await expect(
      depositFunds(42, { currencyCode: 'BRL', amount: DEPOSIT_LIMITS.BRL + 1 })
    ).rejects.toThrow(/monto máximo por carga en BRL/);
  });

  it('acepta un monto exactamente igual al límite de BRL', async () => {
    const balance = makeBalance('0');
    (Balance.findOne as any).mockResolvedValue(balance);

    await expect(
      depositFunds(42, { currencyCode: 'BRL', amount: DEPOSIT_LIMITS.BRL })
    ).resolves.toBeDefined();
  });

  it('usa DEFAULT_MAX_DEPOSIT_AMOUNT para una moneda sin límite propio configurado', async () => {
    await expect(
      depositFunds(42, { currencyCode: 'EUR', amount: DEFAULT_MAX_DEPOSIT_AMOUNT + 1 })
    ).rejects.toThrow(/monto máximo por carga en EUR/);
  });

  it('propaga el error de assertActiveCurrency si la moneda no está activa', async () => {
    (assertActiveCurrency as any).mockRejectedValue(new Error('La moneda "XYZ" no está disponible.'));

    await expect(depositFunds(42, { currencyCode: 'XYZ', amount: 100 })).rejects.toThrow(/no está disponible/);
    expect(Wallet.findOne).not.toHaveBeenCalled();
  });

  it('normaliza currencyCode a mayúsculas', async () => {
    const balance = makeBalance('0');
    (Balance.findOne as any).mockResolvedValue(balance);

    await depositFunds(42, { currencyCode: 'ars', amount: 100 });

    expect(assertActiveCurrency).toHaveBeenCalledWith('ARS');
    expect(Balance.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { walletId: 1, currencyCode: 'ARS' } })
    );
  });

  it('rechaza si el usuario no tiene wallet asociada y hace rollback', async () => {
    (Wallet.findOne as any).mockResolvedValue(null);

    await expect(depositFunds(42, { currencyCode: 'ARS', amount: 100 })).rejects.toThrow(
      /no tiene una wallet asociada/
    );
    expect(mockTransaction.rollback).toHaveBeenCalledTimes(1);
    expect(mockTransaction.commit).not.toHaveBeenCalled();
  });

  it('crea el balance en 0 si todavía no existía, y después le suma el depósito', async () => {
    (Balance.findOne as any).mockResolvedValue(null);
    const created = makeBalance('0');
    (Balance.create as any).mockResolvedValue(created);

    await depositFunds(42, { currencyCode: 'BRL', amount: 250 });

    expect(Balance.create).toHaveBeenCalledWith(
      expect.objectContaining({ walletId: 1, currencyCode: 'BRL', amount: '0' }),
      expect.anything()
    );
    expect(created.update).toHaveBeenCalledWith(
      expect.objectContaining({ amount: (250).toFixed(8) }),
      expect.anything()
    );
  });

  it('suma el depósito sobre un balance ya existente', async () => {
    const balance = makeBalance('1000');
    (Balance.findOne as any).mockResolvedValue(balance);

    await depositFunds(42, { currencyCode: 'ARS', amount: 500 });

    expect(balance.update).toHaveBeenCalledWith(
      expect.objectContaining({ amount: (1500).toFixed(8) }),
      expect.anything()
    );
  });

  it('crea la transacción como type="deposit", sin comisión ni tasa de cambio, y commitea', async () => {
    const balance = makeBalance('0');
    (Balance.findOne as any).mockResolvedValue(balance);

    const result = await depositFunds(42, { currencyCode: 'ARS', amount: 5000 });

    expect(Transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        senderWalletId: 1,
        receiverWalletId: 1,
        type: 'deposit',
        status: 'completed',
        currencyOrigin: 'ARS',
        currencyDestination: null,
        amount: (5000).toFixed(8),
        fee: '0',
        finalAmount: (5000).toFixed(8),
        exchangeRate: null,
      }),
      expect.anything()
    );
    expect(mockTransaction.commit).toHaveBeenCalledTimes(1);
    expect(mockTransaction.rollback).not.toHaveBeenCalled();
    expect(result.transaction.type).toBe('deposit');
    expect(result.transaction.currencyCode).toBe('ARS');
    expect(result.transaction.amount).toBe('5000.00');
    expect(result.wallet).toEqual({ walletId: 1, preferredCurrency: 'ARS', balances: [] });
  });

  it('actualmente NO manda email de confirmación (el bloque está comentado en el service)', async () => {
    const balance = makeBalance('0');
    (Balance.findOne as any).mockResolvedValue(balance);

    await depositFunds(42, { currencyCode: 'ARS', amount: 100 });

    expect(sendTransactionEmail).not.toHaveBeenCalled();
  });

  it('si falla después de abrir la transacción, hace rollback y no commitea', async () => {
    (Balance.findOne as any).mockRejectedValue(new Error('DB caída'));

    await expect(depositFunds(42, { currencyCode: 'ARS', amount: 100 })).rejects.toThrow('DB caída');
    expect(mockTransaction.rollback).toHaveBeenCalledTimes(1);
    expect(mockTransaction.commit).not.toHaveBeenCalled();
  });
});
