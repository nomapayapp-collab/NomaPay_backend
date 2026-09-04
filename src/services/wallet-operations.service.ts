

import sequelize from '../db.js';
import { Wallet } from '../models/wallet.model.js';
import { Balance } from '../models/balance.model.js';
import { Currency } from '../models/currency.model.js';
import { Transaction } from '../models/transaction.model.js';
import type { TransactionType } from '../models/transaction.model.js';
import { User } from '../models/users.model.js';
import { NotFoundError, ValidationError } from '../errors/app-error.js';
import { getExchangeRate } from './exchange-rate.service.js';
import { sendTransactionEmail } from '../mails/mail.js';
import { getWalletSummary } from './wallet.service.js';
import type { WalletSummary } from './wallet.service.js';
import { round2 } from '../utils/money.util.js';


export { round2 };

export const LOCAL_CURRENCY = (process.env.LOCAL_CURRENCY ?? 'ARS').toUpperCase();
export const TRANSACTION_FEE_PERCENTAGE = Number(process.env.TRANSACTION_FEE_PERCENTAGE ?? 0.5);

export interface ConversionInput {
  fromCurrency: string;
  toCurrency: string;
  amount: number;
}

export interface ConversionResult {
  transaction: {
    id: number;
    type: TransactionType;
    status: string;
    currencyOrigin: string;
    currencyDestination: string;
    amount: string;
    fee: string;
    finalAmount: string;
    exchangeRate: string;
    transactionDate: Date;
  };
  wallet: WalletSummary;
}

export interface ConversionMath {
  fee: number;
  totalDebit: number;
  destinationAmount: number;
}


export function calculateConversion(
  amount: number,
  rate: number,
  feePercentage: number = TRANSACTION_FEE_PERCENTAGE
): ConversionMath {
  const fee = (amount * feePercentage) / 100;
  const totalDebit = amount + fee;
  const destinationAmount = amount / rate;
  return { fee, totalDebit, destinationAmount };
}

async function assertActiveCurrency(code: string): Promise<Currency> {
  const currency = await Currency.findOne({ where: { code } });
  if (!currency || !currency.isActive) {
    throw new ValidationError(`La moneda "${code}" no está disponible.`);
  }
  return currency;
}

export async function convertCurrency(
  userId: number,
  type: TransactionType,
  input: ConversionInput
): Promise<ConversionResult> {
  const fromCurrency = input.fromCurrency.toUpperCase();
  const toCurrency = input.toCurrency.toUpperCase();
  const amount = Number(input.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ValidationError('El monto debe ser un número mayor a 0.');
  }
  if (fromCurrency === toCurrency) {
    throw new ValidationError('La moneda de origen y destino no pueden ser la misma.');
  }

  await assertActiveCurrency(fromCurrency);
  await assertActiveCurrency(toCurrency);


 
  const rate = await getExchangeRate(fromCurrency, toCurrency);
  const { fee, totalDebit, destinationAmount } = calculateConversion(amount, rate);

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

    const originBalance = await Balance.findOne({
      where: { walletId: wallet.id, currencyCode: fromCurrency },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!originBalance) {
      throw new NotFoundError(`No existe balance en ${fromCurrency} para esta wallet.`);
    }

    if (Number(originBalance.amount) < totalDebit) {
      throw new ValidationError(
        `Saldo insuficiente en ${fromCurrency}. Se necesitan ${round2(totalDebit)} (monto + comisión) ` +
          `y el saldo disponible es ${originBalance.amount}.`
      );
    }

    let destinationBalance = await Balance.findOne({
      where: { walletId: wallet.id, currencyCode: toCurrency },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!destinationBalance) {
    
      destinationBalance = await Balance.create(
        { walletId: wallet.id, currencyCode: toCurrency, amount: '0' },
        { transaction: t }
      );
    }

    await originBalance.update(
      {
        amount: (Number(originBalance.amount) - totalDebit).toFixed(8),
        updatedAt: new Date(),
      },
      { transaction: t }
    );

    await destinationBalance.update(
      {
        amount: (Number(destinationBalance.amount) + destinationAmount).toFixed(8),
        updatedAt: new Date(),
      },
      { transaction: t }
    );

    const createdTransaction = await Transaction.create(
      {
        senderWalletId: wallet.id,
        receiverWalletId: wallet.id, 
        type,
        status: 'completed',
        currencyOrigin: fromCurrency,
        currencyDestination: toCurrency,
        amount: amount.toFixed(8),
        fee: fee.toFixed(8),
        finalAmount: round2(destinationAmount),
        exchangeRate: rate.toFixed(8),
      },
      { transaction: t }
    );

    await t.commit();
    committed = true;

  
    const user = await User.findByPk(userId);
    if (user) {
      sendTransactionEmail(user, {
        type,
        amount: amount.toFixed(2),
        fee: fee.toFixed(2),
        finalAmount: round2(destinationAmount),
        currencyOrigin: fromCurrency,
        currencyDestination: toCurrency,
        exchangeRate: rate.toFixed(4),
        transactionDate: createdTransaction.transactionDate,
      }).catch((err) => console.error('❌ Error enviando email de transacción:', err));
    }

    const walletSummary = await getWalletSummary(userId);

    return {
      transaction: {
        id: createdTransaction.id,
        type: createdTransaction.type,
        status: createdTransaction.status,
        currencyOrigin: createdTransaction.currencyOrigin,
        currencyDestination: createdTransaction.currencyDestination as string,
       
        amount: round2(createdTransaction.amount),
        fee: round2(createdTransaction.fee),
        finalAmount: round2(createdTransaction.finalAmount as string),
       
        exchangeRate: Number(createdTransaction.exchangeRate).toFixed(4),
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

export async function exchangeCurrency(userId: number, input: ConversionInput): Promise<ConversionResult> {
  return convertCurrency(userId, 'exchange', input);
}