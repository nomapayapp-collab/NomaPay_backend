// controllers/wallet-operations.controller.ts
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { exchangeCurrency, LOCAL_CURRENCY } from '../services/wallet-operations.service.js';
import { getRatesForBase } from '../services/exchange-rate.service.js';
import { Currency } from '../models/currency.model.js';
import { AppError } from '../errors/app-error.js';

function parseAmount(raw: unknown): number {
    return typeof raw === 'number' ? raw : Number(raw);
}

export async function postExchange(req: AuthenticatedRequest, res: Response) {
    try {
        const { fromCurrency, toCurrency, amount } = req.body;
        if (!fromCurrency || !toCurrency || amount === undefined || amount === null) {
            return res.status(400).json({ error: 'Faltan fromCurrency, toCurrency o amount.' });
        }
        const result = await exchangeCurrency(req.user!.userId, {
            fromCurrency,
            toCurrency,
            amount: parseAmount(amount),
        });
        return res.status(201).json(result);
    } catch (err) {
        if (err instanceof AppError) {
            return res.status(err.statusCode).json({ error: err.message });
        }
        console.error(err);
        return res.status(500).json({ error: 'Error al procesar el intercambio.' });
    }
}

export async function getExchangeRates(req: AuthenticatedRequest, res: Response) {
    try {
        const base = (typeof req.query.base === 'string' ? req.query.base : LOCAL_CURRENCY).toUpperCase();

        const activeCurrencies = await Currency.findAll({ where: { isActive: true } });
        const rates = await getRatesForBase(base);

        const filteredRates: Record<string, number> = {};
        for (const currency of activeCurrencies) {
            if (currency.code !== base && rates[currency.code] !== undefined) {
                filteredRates[currency.code] = rates[currency.code] as number;
            }
        }

        return res.status(200).json({
            base,
            rates: filteredRates,
            fetchedAt: new Date().toISOString(),
        });
    } catch (err) {
        if (err instanceof AppError) {
            return res.status(err.statusCode).json({ error: err.message });
        }
        console.error(err);
        return res.status(500).json({ error: 'Error al obtener las tasas de cambio.' });
    }
}