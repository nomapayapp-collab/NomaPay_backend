import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { Op, type FindOptions } from 'sequelize';
import type { User as UserModel } from '../src/models/users.model.js';
import type { Wallet as WalletModel } from '../src/models/wallet.model.js';
import type { Balance as BalanceModel } from '../src/models/balance.model.js';
import type { Transaction as TransactionModel } from '../src/models/transaction.model.js';
import type { Currency as CurrencyModel } from '../src/models/currency.model.js';

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
  User: { findOne: vi.fn(), findByPk: vi.fn() },
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
const SENDER_USER = { id: SENDER_ID, name: 'Ana', surname: 'Gómez', email: 'ana@test.com' };
const RECEIVER = { id: 7, name: 'Juan', surname: 'Pérez', alias: 'juan.perez', cbu: '000111222', email: 'juan@test.com' };


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

function asUser(partial: Record<string, unknown>): UserModel {
  return partial as unknown as UserModel;
}
function asWallet(partial: Record<string, unknown>): WalletModel {
  return partial as unknown as WalletModel;
}
function asBalance(partial: FakeBalance): BalanceModel {
  return partial as unknown as BalanceModel;
}
function asCurrency(partial: Record<string, unknown>): CurrencyModel {
  return partial as unknown as CurrencyModel;
}
function asTransaction(partial: Record<string, unknown>): TransactionModel {
  return partial as unknown as TransactionModel;
}


function whereOf(options: FindOptions | undefined): Record<string | symbol, unknown> {
  return (options?.where ?? {}) as Record<string | symbol, unknown>;
}

describe('transfer.service — transferFunds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.commit.mockReset();
    mockTransaction.rollback.mockReset();

    vi.mocked(assertActiveCurrency).mockResolvedValue(asCurrency({ code: 'ARS', isActive: true }));
    vi.mocked(User.findOne).mockResolvedValue(asUser(RECEIVER));
    vi.mocked(User.findByPk).mockResolvedValue(asUser(SENDER_USER));
    vi.mocked(Wallet.findOne).mockImplementation((options) => {
      const where = whereOf(options);
      return Promise.resolve(
        where.userId === SENDER_ID
          ? asWallet({ id: 1, userId: SENDER_ID })
          : asWallet({ id: 2, userId: RECEIVER.id })
      );
    });
    vi.mocked(Transaction.create).mockImplementation((data) =>
      Promise.resolve(asTransaction({ id: 55, ...data, transactionDate: new Date('2026-01-01T00:00:00Z') }))
    );
  });

  it('guarda el mensaje personalizado en la transacción cuando se provee', async () => {
    const senderBalance = makeBalance('10000');
    const receiverBalance = makeBalance('0');
    vi.mocked(Balance.findOne).mockImplementation((options) => {
      const where = whereOf(options);
      return Promise.resolve(asBalance(where.walletId === 1 ? senderBalance : receiverBalance));
    });

    await transferFunds(SENDER_ID, {
      aliasOrCbu: 'juan.perez',
      currencyCode: 'ARS',
      amount: 500,
      message: 'Regalo de cumpleaños 🎁',
    });

    expect(Transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Regalo de cumpleaños 🎁',
      }),
      expect.anything()
    );
  });

  it('guarda message como null si no se envía ningún mensaje', async () => {
    const senderBalance = makeBalance('10000');
    const receiverBalance = makeBalance('0');
    vi.mocked(Balance.findOne).mockImplementation((options) => {
      const where = whereOf(options);
      return Promise.resolve(asBalance(where.walletId === 1 ? senderBalance : receiverBalance));
    });

    await transferFunds(SENDER_ID, {
      aliasOrCbu: 'juan.perez',
      currencyCode: 'ARS',
      amount: 500,
    });

    expect(Transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: null,
      }),
      expect.anything()
    );
  });

  it('rechaza transferirse a uno mismo', async () => {
    vi.mocked(User.findOne).mockResolvedValue(asUser({ ...RECEIVER, id: SENDER_ID }));

    await expect(
      transferFunds(SENDER_ID, { aliasOrCbu: 'mi.propio.alias', currencyCode: 'ARS', amount: 100 })
    ).rejects.toThrow(/vos mismo/);
    expect(mockTransaction.rollback).toHaveBeenCalledTimes(1);
  });

  it('rechaza si no existe ningún usuario con ese alias/CBU', async () => {
    vi.mocked(User.findOne).mockResolvedValue(null);

    await expect(
      transferFunds(SENDER_ID, { aliasOrCbu: 'no.existe', currencyCode: 'ARS', amount: 100 })
    ).rejects.toThrow(/No se encontró ningún usuario/);
    expect(mockTransaction.rollback).toHaveBeenCalledTimes(1);
  });

  it('busca al receptor por alias O cbu (Op.or)', async () => {
    const senderBalance = makeBalance('10000');
    vi.mocked(Balance.findOne).mockImplementation((options) => {
      const where = whereOf(options);
      return Promise.resolve(asBalance(where.walletId === 1 ? senderBalance : makeBalance('0')));
    });

    await transferFunds(SENDER_ID, { aliasOrCbu: 'juan.perez', currencyCode: 'ARS', amount: 100 });

    const call = vi.mocked(User.findOne).mock.calls[0];
    const where = whereOf(call?.[0]);
    expect(where[Op.or]).toEqual([{ alias: 'juan.perez' }, { cbu: 'juan.perez' }]);
  });

  it('rechaza si el emisor no tiene wallet asociada', async () => {
    vi.mocked(Wallet.findOne).mockImplementation((options) => {
      const where = whereOf(options);
      return Promise.resolve(where.userId === SENDER_ID ? null : asWallet({ id: 2, userId: RECEIVER.id }));
    });

    await expect(
      transferFunds(SENDER_ID, { aliasOrCbu: 'juan.perez', currencyCode: 'ARS', amount: 100 })
    ).rejects.toThrow(/No tenés una wallet asociada/);
  });

  it('rechaza si el receptor no tiene wallet activa', async () => {
    vi.mocked(Wallet.findOne).mockImplementation((options) => {
      const where = whereOf(options);
      return Promise.resolve(where.userId === SENDER_ID ? asWallet({ id: 1, userId: SENDER_ID }) : null);
    });

    await expect(
      transferFunds(SENDER_ID, { aliasOrCbu: 'juan.perez', currencyCode: 'ARS', amount: 100 })
    ).rejects.toThrow(/usuario destino no tiene wallet activa/);
  });

  it('rechaza si el saldo del emisor es insuficiente y hace rollback', async () => {
    const senderBalance = makeBalance('50');
    vi.mocked(Balance.findOne).mockImplementation((options) => {
      const where = whereOf(options);
      return Promise.resolve(asBalance(where.walletId === 1 ? senderBalance : makeBalance('0')));
    });

    await expect(
      transferFunds(SENDER_ID, { aliasOrCbu: 'juan.perez', currencyCode: 'ARS', amount: 500 })
    ).rejects.toThrow(/Saldo insuficiente/);

    expect(mockTransaction.rollback).toHaveBeenCalledTimes(1);
    expect(mockTransaction.commit).not.toHaveBeenCalled();
    expect(Transaction.create).not.toHaveBeenCalled();
  });

  it('rechaza si el emisor no tiene ni balance creado en esa moneda (undefined)', async () => {
    vi.mocked(Balance.findOne).mockImplementation((options) => {
      const where = whereOf(options);
      return Promise.resolve(where.walletId === 1 ? null : asBalance(makeBalance('0')));
    });

    await expect(
      transferFunds(SENDER_ID, { aliasOrCbu: 'juan.perez', currencyCode: 'ARS', amount: 100 })
    ).rejects.toThrow(/Saldo insuficiente/);
  });

  it('descuenta del emisor y acredita al receptor el mismo monto', async () => {
    const senderBalance = makeBalance('10000');
    const receiverBalance = makeBalance('500');
    vi.mocked(Balance.findOne).mockImplementation((options) => {
      const where = whereOf(options);
      return Promise.resolve(asBalance(where.walletId === 1 ? senderBalance : receiverBalance));
    });

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
    vi.mocked(Balance.findOne).mockImplementation((options) => {
      const where = whereOf(options);
      return Promise.resolve(where.walletId === 1 ? asBalance(senderBalance) : null);
    });
    vi.mocked(Balance.create).mockResolvedValue(asBalance(createdReceiverBalance));

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
    vi.mocked(Balance.findOne).mockImplementation((options) => {
      const where = whereOf(options);
      return Promise.resolve(asBalance(where.walletId === 1 ? senderBalance : receiverBalance));
    });

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

  it('manda email tanto al emisor como al receptor, con moneda de origen=destino y sin exchangeRate', async () => {
    const senderBalance = makeBalance('10000');
    const receiverBalance = makeBalance('0');
    vi.mocked(Balance.findOne).mockImplementation((options) => {
      const where = whereOf(options);
      return Promise.resolve(asBalance(where.walletId === 1 ? senderBalance : receiverBalance));
    });

    await transferFunds(SENDER_ID, { aliasOrCbu: 'juan.perez', currencyCode: 'ARS', amount: 100 });

    expect(sendTransactionEmail).toHaveBeenCalledTimes(2);

    expect(sendTransactionEmail).toHaveBeenCalledWith(
      asUser(SENDER_USER),
      expect.objectContaining({
        type: 'transfer',
        role: 'sender',
        amount: '100.00',
        fee: '0.00',
        finalAmount: '100.00',
        currencyOrigin: 'ARS',
        currencyDestination: 'ARS',
        counterpartyName: 'Juan Pérez',
      })
    );
    const firstCall = vi.mocked(sendTransactionEmail).mock.calls[0];
    expect(firstCall?.[1]).not.toHaveProperty('exchangeRate');

    expect(sendTransactionEmail).toHaveBeenCalledWith(
      asUser(RECEIVER),
      expect.objectContaining({
        type: 'transfer',
        role: 'receiver',
        currencyOrigin: 'ARS',
        currencyDestination: 'ARS',
        counterpartyName: 'Ana Gómez',
      })
    );
    const secondCall = vi.mocked(sendTransactionEmail).mock.calls[1];
    expect(secondCall?.[1]).not.toHaveProperty('exchangeRate');
  });

  it('si no encuentra al senderUser por findByPk, igual manda el email al receptor (con counterpartyName vacío)', async () => {
    const senderBalance = makeBalance('10000');
    const receiverBalance = makeBalance('0');
    vi.mocked(Balance.findOne).mockImplementation((options) => {
      const where = whereOf(options);
      return Promise.resolve(asBalance(where.walletId === 1 ? senderBalance : receiverBalance));
    });
    vi.mocked(User.findByPk).mockResolvedValue(null);

    await transferFunds(SENDER_ID, { aliasOrCbu: 'juan.perez', currencyCode: 'ARS', amount: 100 });

    expect(sendTransactionEmail).toHaveBeenCalledTimes(1);
    expect(sendTransactionEmail).toHaveBeenCalledWith(
      asUser(RECEIVER),
      expect.objectContaining({ role: 'receiver', counterpartyName: '' })
    );
  });

  it('propaga el error de assertActiveCurrency si la moneda no está activa', async () => {
    vi.mocked(assertActiveCurrency).mockRejectedValue(new Error('La moneda "XYZ" no está disponible.'));

    await expect(
      transferFunds(SENDER_ID, { aliasOrCbu: 'juan.perez', currencyCode: 'XYZ', amount: 100 })
    ).rejects.toThrow(/no está disponible/);
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it('normaliza currencyCode a mayúsculas', async () => {
    const senderBalance = makeBalance('10000');
    const receiverBalance = makeBalance('0');
    vi.mocked(Balance.findOne).mockImplementation((options) => {
      const where = whereOf(options);
      return Promise.resolve(asBalance(where.walletId === 1 ? senderBalance : receiverBalance));
    });

    await transferFunds(SENDER_ID, { aliasOrCbu: 'juan.perez', currencyCode: 'ars', amount: 100 });

    expect(assertActiveCurrency).toHaveBeenCalledWith('ARS');
  });
});