import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import jwt from 'jsonwebtoken';
import * as walletService from '../src/services/wallet.service.js';
import * as walletOperationsService from '../src/services/wallet-operations.service.js';
import * as exchangeRateService from '../src/services/exchange-rate.service.js';
import { Currency } from '../src/models/currency.model.js';

vi.mock('jsonwebtoken');

describe('Wallet Endpoints', () => {
    it('GET /api/wallets/me - Debería rechazar con 401 si no hay cookie de autenticación', async () => {
        const res = await request(app).get('/api/wallets/me');
        expect(res.status).toBe(401);
        expect(res.body.error).toBe('No autenticado. Falta la cookie.');
    });
    it('GET /api/wallets/me - Debería rechazar con 401 si el token expiró', async () => {
        const error = new jwt.TokenExpiredError('jwt expired', new Date());
        vi.mocked(jwt.verify).mockImplementation(() => { throw error; });
        const res = await request(app)
            .get('/api/wallets/me')
            .set('Cookie', 'accessToken=fake-expired-token');
        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Tu access token expiró.');
        expect(res.body.code).toBe('TOKEN_EXPIRED');
    });
    it('GET /api/wallets/me - Debería rechazar con 401 si el token es inválido/falso', async () => {
        vi.mocked(jwt.verify).mockImplementation(() => { throw new Error('invalid signature'); });
        const res = await request(app)
            .get('/api/wallets/me')
            .set('Cookie', 'accessToken=malo-fake-invalid-token');
        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Token inválido.');
    });
    it('GET /api/wallets/me - Debería devolver la wallet y balances si el usuario está autenticado', async () => {
        vi.mocked(jwt.verify).mockReturnValue({ userId: 1, email: 'test@nomapay.com' } as any);
        vi.spyOn(walletService, 'getWalletSummary').mockResolvedValue({
            walletId: 10,
            preferredCurrency: 'USD',
            balances: [
                { currencyCode: 'USD', currencyName: 'Dólares', symbol: '$', amount: '150.00' }
            ]
        });
        const res = await request(app)
            .get('/api/wallets/me')
            .set('Cookie', 'accessToken=fake-valid-token');
        expect(res.body.preferredCurrency).toBe('USD');
        expect(res.body.balances[0].amount).toBe('150.00');
    });

    it('GET /api/wallets/me/exchange-rates - Debería rechazar con 401 si no hay cookie de autenticación', async () => {
        const res = await request(app).get('/api/wallets/me/exchange-rates');
        expect(res.status).toBe(401);
    });

    it('GET /api/wallets/me/exchange-rates - Debería devolver las tasas filtradas por monedas activas', async () => {
        vi.mocked(jwt.verify).mockReturnValue({ userId: 1, email: 'test@nomapay.com' } as any);
        vi.spyOn(Currency, 'findAll').mockResolvedValue([
            { code: 'USD' } as any,
            { code: 'BRL' } as any,
        ]);
        vi.spyOn(exchangeRateService, 'getRatesForBase').mockResolvedValue({
            USD: 0.000663,
            BRL: 0.003378,
            EUR: 0.00061, // no está entre las monedas activas: no debería aparecer en la respuesta
        });

        const res = await request(app)
            .get('/api/wallets/me/exchange-rates?base=ARS')
            .set('Cookie', 'accessToken=fake-valid-token');

        expect(res.status).toBe(200);
        expect(res.body.base).toBe('ARS');
        expect(res.body.rates).toEqual({ USD: 0.000663, BRL: 0.003378 });
        expect(res.body.rates.EUR).toBeUndefined();
    });

    it('POST /api/wallets/me/exchange - Debería rechazar con 401 si no hay cookie de autenticación', async () => {
        const res = await request(app)
            .post('/api/wallets/me/exchange')
            .send({ fromCurrency: 'ARS', toCurrency: 'USD', amount: 10000 });
        expect(res.status).toBe(401);
    });

    it('POST /api/wallets/me/exchange - Debería rechazar con 400 si faltan campos obligatorios', async () => {
        vi.mocked(jwt.verify).mockReturnValue({ userId: 1, email: 'test@nomapay.com' } as any);
        const res = await request(app)
            .post('/api/wallets/me/exchange')
            .set('Cookie', 'accessToken=fake-valid-token')
            .send({ fromCurrency: 'ARS' }); // falta toCurrency y amount
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Faltan/);
    });

    it('POST /api/wallets/me/exchange - Debería devolver 201 con la transacción y la wallet actualizada', async () => {
        vi.mocked(jwt.verify).mockReturnValue({ userId: 1, email: 'test@nomapay.com' } as any);
        vi.spyOn(walletOperationsService, 'exchangeCurrency').mockResolvedValue({
            transaction: {
                id: 4,
                type: 'exchange',
                status: 'completed',
                currencyOrigin: 'ARS',
                currencyDestination: 'USD',
                amount: '10000.00',
                fee: '50.00',
                finalAmount: '6.63',
                exchangeRate: '1508.2111',
                transactionDate: new Date('2026-09-04T01:48:13.004Z'),
            },
            wallet: {
                walletId: 11,
                preferredCurrency: 'USD',
                balances: [
                    { currencyCode: 'USD', currencyName: 'Dólar Estadounidense', symbol: '$', amount: '6.63' },
                    { currencyCode: 'ARS', currencyName: 'Peso Argentino', symbol: '$', amount: '489950.00' },
                ],
            },
        });

        const res = await request(app)
            .post('/api/wallets/me/exchange')
            .set('Cookie', 'accessToken=fake-valid-token')
            .send({ fromCurrency: 'ARS', toCurrency: 'USD', amount: 10000 });

        expect(res.status).toBe(201);
        expect(res.body.transaction.type).toBe('exchange');
        expect(res.body.transaction.finalAmount).toBe('6.63');
        expect(res.body.wallet.balances[0].amount).toBe('6.63');
    });
});