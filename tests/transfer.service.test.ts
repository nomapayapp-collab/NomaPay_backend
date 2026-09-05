// tests/transfer.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Op } from 'sequelize';

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

vi.mock('../src/models/users.model.js', () => ({
  User: { findOne: vi.fn() },
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

vi.mock('../src/services/wallet-operations.service.js', () => ({
  assertActiveCurrency: vi.fn(),
}));

vi.mock('../src/mails/mail.js', () => ({
  sendTransactionEmail: vi.fn().mockResolvedValue(undefined),
}));

const { User } = await import('../src/models/users.model.js');
const { Wallet } = await import('../src/models/wallet.model.js');
const { Balance } = await import('../src/models/balance.model.js');
const { Transaction } = await import('../src/models/transaction.model.js');
const { assertActiveCurrency } = await import('../src/services/wallet-operations.service.js');
const { sendTransactionEmail } = await import('../src/mails/mail.js');

const { transferFunds } = await import('../src/services/transfer.service.js');

const SENDER_ID = 42;
const RECEIVER = { id: 7, name: 'Juan', surname: 'Pérez', alias: 'juan.perez', cbu: '000111222' };

function makeBalance(amount: string) {
  return {
    amount,
    update: vi.fn().mockImplementation(function (this: any, values: any) {
      Object.assign(this, values);
      return Promise.resolve(this);
    }),
  };
}

describe('transfer.service — transferFunds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.commit.mockReset();
    mockTransaction.rollback.mockReset();

    (assertActiveCurrency as any).mockResolvedValue({ code: 'ARS', isActive: true });
    (User.findOne as any).mockResolvedValue(RECEIVER);
    (Wallet.findOne as any).mockImplementation(({ where }: any) =>
      Promise.resolve(where.userId === SENDER_ID ? { id: 1, userId: SENDER_ID } : { id: 2, userId: RECEIVER.id })
    );
    (Transaction.create as any).mockImplementation((data: any) =>
      Promise.resolve({ id: 55, ...data, transactionDate: new Date('2026-01-01T00:00:00Z') })
    );
  });

  it('rechaza transferirse a uno mismo', async () => {
    (User.findOne as any).mockResolvedValue({ ...RECEIVER, id: SENDER_ID });

    await expect(
      transferFunds(SENDER_ID, { aliasOrCbu: 'mi.propio.alias', currencyCode: 'ARS', amount: 100 })
    ).rejects.toThrow(/vos mismo/);
    expect(mockTransaction.rollback).toHaveBeenCalledTimes(1);
  });

  it('rechaza si no existe ningún usuario con ese alias/CBU', async () => {
    (User.findOne as any).mockResolvedValue(null);

    await expect(
      transferFunds(SENDER_ID, { aliasOrCbu: 'no.existe', currencyCode: 'ARS', amount: 100 })
    ).rejects.toThrow(/No se encontró ningún usuario/);
    expect(mockTransaction.rollback).toHaveBeenCalledTimes(1);
  });

  it('busca al receptor por alias O cbu (Op.or)', async () => {
    const senderBalance = makeBalance('10000');
    (Balance.findOne as any).mockImplementation(({ where }: any) =>
      Promise.resolve(where.walletId === 1 ? senderBalance : makeBalance('0'))
    );

    await transferFunds(SENDER_ID, { aliasOrCbu: 'juan.perez', currencyCode: 'ARS', amount: 100 });

    const call = (User.findOne as any).mock.calls[0][0];
    expect(call.where[Op.or]).toEqual([{ alias: 'juan.perez' }, { cbu: 'juan.perez' }]);
  });

  it('rechaza si el emisor no tiene wallet asociada', async () => {
    (Wallet.findOne as any).mockImplementation(({ where }: any) =>
      Promise.resolve(where.userId === SENDER_ID ? null : { id: 2, userId: RECEIVER.id })
    );

    await expect(
      transferFunds(SENDER_ID, { aliasOrCbu: 'juan.perez', currencyCode: 'ARS', amount: 100 })
    ).rejects.toThrow(/No tenés una wallet asociada/);
  });

  it('rechaza si el receptor no tiene wallet activa', async () => {
    (Wallet.findOne as any).mockImplementation(({ where }: any) =>
      Promise.resolve(where.userId === SENDER_ID ? { id: 1, userId: SENDER_ID } : null)
    );

    await expect(
      transferFunds(SENDER_ID, { aliasOrCbu: 'juan.perez', currencyCode: 'ARS', amount: 100 })
    ).rejects.toThrow(/usuario destino no tiene wallet activa/);
  });

  it('rechaza si el saldo del emisor es insuficiente y hace rollback', async () => {
    const senderBalance = makeBalance('50');
    (Balance.findOne as any).mockImplementation(({ where }: any) =>
      Promise.resolve(where.walletId === 1 ? senderBalance : makeBalance('0'))
    );

    await expect(
      transferFunds(SENDER_ID, { aliasOrCbu: 'juan.perez', currencyCode: 'ARS', amount: 500 })
    ).rejects.toThrow(/Saldo insuficiente/);

    expect(mockTransaction.rollback).toHaveBeenCalledTimes(1);
    expect(mockTransaction.commit).not.toHaveBeenCalled();
    expect(Transaction.create).not.toHaveBeenCalled();
  });

  it('rechaza si el emisor no tiene ni balance creado en esa moneda (undefined)', async () => {
    (Balance.findOne as any).mockImplementation(({ where }: any) =>
      Promise.resolve(where.walletId === 1 ? null : makeBalance('0'))
    );

    await expect(
      transferFunds(SENDER_ID, { aliasOrCbu: 'juan.perez', currencyCode: 'ARS', amount: 100 })
    ).rejects.toThrow(/Saldo insuficiente/);
  });

  it('descuenta del emisor y acredita al receptor el mismo monto', async () => {
    const senderBalance = makeBalance('10000');
    const receiverBalance = makeBalance('500');
    (Balance.findOne as any).mockImplementation(({ where }: any) =>
      Promise.resolve(where.walletId === 1 ? senderBalance : receiverBalance)
    );

    await transferFunds(SENDER_ID, { aliasOrCbu: 'juan.perez', currencyCode: 'ARS', amount: 1000 });

    expect(senderBalance.update).toHaveBeenCalledWith(
      expect.objectContaining({ amount: (10000 - 1000).toFixed(8) }),
      expect.anything()
    );
    expect(receiverBalance.update).toHaveBeenCalledWith(
      expect.objectContaining({ amount: (500 + 1000).toFixed(8) }),
      expect.anything()
    );
  });

  it('crea el balance del receptor en 0 si todavía no existía en esa moneda', async () => {
    const senderBalance = makeBalance('10000');
    const createdReceiverBalance = makeBalance('0');
    (Balance.findOne as any).mockImplementation(({ where }: any) =>
      Promise.resolve(where.walletId === 1 ? senderBalance : null)
    );
    (Balance.create as any).mockResolvedValue(createdReceiverBalance);

    await transferFunds(SENDER_ID, { aliasOrCbu: 'juan.perez', currencyCode: 'BRL', amount: 200 });

    expect(Balance.create).toHaveBeenCalledWith(
      expect.objectContaining({ walletId: 2, currencyCode: 'BRL', amount: '0' }),
      expect.anything()
    );
    expect(createdReceiverBalance.update).toHaveBeenCalledWith(
      expect.objectContaining({ amount: (200).toFixed(8) }),
      expect.anything()
    );
  });

  it('crea la transacción como type="transfer", sin comisión ni tasa de cambio, y commitea', async () => {
    const senderBalance = makeBalance('10000');
    const receiverBalance = makeBalance('0');
    (Balance.findOne as any).mockImplementation(({ where }: any) =>
      Promise.resolve(where.walletId === 1 ? senderBalance : receiverBalance)
    );

    const result = await transferFunds(SENDER_ID, {
      aliasOrCbu: 'juan.perez',
      currencyCode: 'ARS',
      amount: 2500,
    });

    expect(Transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        senderWalletId: 1,
        receiverWalletId: 2,
        type: 'transfer',
        status: 'completed',
        currencyOrigin: 'ARS',
        currencyDestination: null,
        amount: (2500).toFixed(8),
        fee: '0',
        finalAmount: (2500).toFixed(8),
        exchangeRate: null,
      }),
      expect.anything()
    );
    expect(mockTransaction.commit).toHaveBeenCalledTimes(1);
    expect(mockTransaction.rollback).not.toHaveBeenCalled();
    expect(result.message).toBe('Transferencia exitosa');
    expect(result.transaction.receiverName).toBe('Juan Pérez');
    expect(result.transaction.receiverAlias).toBe('juan.perez');
    expect(result.transaction.amount).toBe('2500.00');
    expect(result.transaction.currencyCode).toBe('ARS');
  });

  it('actualmente NO manda email de confirmación (el bloque está comentado en el service)', async () => {
    const senderBalance = makeBalance('10000');
    const receiverBalance = makeBalance('0');
    (Balance.findOne as any).mockImplementation(({ where }: any) =>
      Promise.resolve(where.walletId === 1 ? senderBalance : receiverBalance)
    );

    await transferFunds(SENDER_ID, { aliasOrCbu: 'juan.perez', currencyCode: 'ARS', amount: 100 });

    expect(sendTransactionEmail).not.toHaveBeenCalled();
  });

  it('propaga el error de assertActiveCurrency si la moneda no está activa', async () => {
    (assertActiveCurrency as any).mockRejectedValue(new Error('La moneda "XYZ" no está disponible.'));

    await expect(
      transferFunds(SENDER_ID, { aliasOrCbu: 'juan.perez', currencyCode: 'XYZ', amount: 100 })
    ).rejects.toThrow(/no está disponible/);
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it('normaliza currencyCode a mayúsculas', async () => {
    const senderBalance = makeBalance('10000');
    const receiverBalance = makeBalance('0');
    (Balance.findOne as any).mockImplementation(({ where }: any) =>
      Promise.resolve(where.walletId === 1 ? senderBalance : receiverBalance)
    );

    await transferFunds(SENDER_ID, { aliasOrCbu: 'juan.perez', currencyCode: 'ars', amount: 100 });

    expect(assertActiveCurrency).toHaveBeenCalledWith('ARS');
  });
});