import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import jwt from 'jsonwebtoken';
import * as walletService from '../src/services/wallet.service.js';



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
});
