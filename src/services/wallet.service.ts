// services/wallet.service.ts
import { Wallet } from '../models/wallet.model.js';
import { Balance } from '../models/balance.model.js';
import { Currency } from '../models/currency.model.js';
import { NotFoundError, ValidationError } from '../errors/app-error.js';
import { round2 } from '../utils/money.util.js';

export interface BalanceDetail {
  currencyCode: string;
  currencyName: string;
  symbol: string | null;
  amount: string;
}

export interface WalletSummary {
  walletId: number;
  preferredCurrency: string;
  balances: BalanceDetail[];
}

export async function getWalletSummary(userId: number): Promise<WalletSummary> {
  const wallet = await Wallet.findOne({ where: { userId } });

  if (!wallet) {
    throw new NotFoundError('Este usuario no tiene una wallet asociada.');
  }

  const balances = await Balance.findAll({ where: { walletId: wallet.id } });

  const currencyCodes = balances.map((b) => b.currencyCode);
  const currencies = await Currency.findAll({ where: { code: currencyCodes } });
  const currencyMap = new Map(currencies.map((c) => [c.code, c]));

  return {
    walletId: wallet.id,
    preferredCurrency: wallet.preferredCurrency,
    balances: balances.map((b) => {
      const currency = currencyMap.get(b.currencyCode);
      return {
        currencyCode: b.currencyCode,
        currencyName: currency?.name ?? b.currencyCode,
        symbol: currency?.symbol ?? null,
        
        amount: round2(b.amount),
      };
    }),
  };
}

export async function updatePreferredCurrency(
  userId: number,
  currencyCode: string
): Promise<WalletSummary> {
  const wallet = await Wallet.findOne({ where: { userId } });

  if (!wallet) {
    throw new NotFoundError('Este usuario no tiene una wallet asociada.');
  }

  const currency = await Currency.findOne({ where: { code: currencyCode.toUpperCase() } });

  if (!currency || !currency.isActive) {
    throw new ValidationError(`La moneda "${currencyCode}" no está disponible.`);
  }

  await wallet.update({ preferredCurrency: currency.code });

  return getWalletSummary(userId);
}