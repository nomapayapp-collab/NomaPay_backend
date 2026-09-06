import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import * as loginService from '../src/services/login.service.js';
import * as authService from '../src/services/auth.service.js';
import * as tokenService from '../src/services/token.service.js';


describe('Auth Endpoints', () => {


    it('POST /api/auth/register - Debería fallar si faltan campos obligatorios', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ email: 'test@nomapay.com' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Faltan campos obligatorios');
    });

    it('POST /api/auth/register - Debería fallar si el email tiene formato inválido', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({
                name: 'Test', surname: 'User', country: 'AR',
                email: 'estonoesunemail.com',
                password: 'PasswordFuerte123!'
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Email inválido.');
    });

    it('POST /api/auth/register - Debería fallar si la contraseña es muy corta', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({
                name: 'Test', surname: 'User', country: 'AR',
                email: 'test@nomapay.com',
                password: 'corta'
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('La contraseña debe tener entre 8 y 32 caracteres');
    });

    it('POST /api/auth/register - Debería fallar si el país no tiene exactamente 2 letras', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({
                name: 'Test', surname: 'User',
                country: 'ARGENTINA',
                email: 'test@nomapay.com',
                password: 'PasswordFuerte123!'
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('código ISO de 2 letras');
    });


    it('POST /api/auth/register - Debería registrar un usuario exitosamente', async () => {

        vi.spyOn(authService, 'registerUser').mockResolvedValue({
            id: 1,
            email: 'test@nomapay.com',
            name: 'Test',
            surname: 'User',
            username: 'test.user',
            alias: 'test.user',
            cbu: '1234567890123456789012'
        } as any); //PREGUNTAR EL ANY

        const res = await request(app)
            .post('/api/auth/register')
            .send({
                name: 'Test',
                surname: 'User',
                country: 'AR',
                email: 'test@nomapay.com',
                password: 'PasswordFuerte123!'
            });

        expect(res.status).toBe(201);
        expect(res.body.email).toBe('test@nomapay.com');
    });

    it('POST /api/auth/login - Debería fallar con credenciales incorrectas', async () => {

        vi.spyOn(loginService, 'loginUser').mockRejectedValue(new Error('Email o contraseña incorrectos'));
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'test@nomapay.com', password: 'PasswordMala123!' });
        expect(res.status).toBeGreaterThanOrEqual(400);
    });


    it('POST /api/auth/login - Debería hacer login exitoso y devolver cookies seguras', async () => {
        vi.spyOn(loginService, 'loginUser').mockResolvedValue({
            accessToken: 'fake-access-token-123',
            refreshToken: 'fake-refresh-token-456',
            user: { id: 1, email: 'test@nomapay.com', name: 'Test' } as any
        });

        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'test@nomapay.com', password: 'PasswordFuerte123!' });

        expect(res.status).toBe(200);
        expect(res.body.email).toBe('test@nomapay.com');
        expect(res.headers['set-cookie']).toBeDefined();
        expect(res.headers['set-cookie']![0]).toContain('accessToken=fake-access-token-123');
    });

    it('POST /api/auth/refresh - Debería fallar si no se envía el refreshToken en la cookie', async () => {

        const res = await request(app).post('/api/auth/refresh');
        expect(res.status).toBe(401);
        expect(res.body.error).toContain('Falta el refreshToken');
    });


    it('POST /api/auth/refresh - Debería rotar los tokens exitosamente', async () => {

        vi.spyOn(tokenService, 'refreshAccessToken').mockResolvedValue({
            accessToken: 'new-access-token',
            refreshToken: 'new-refresh-token'
        });

        const res = await request(app)
            .post('/api/auth/refresh')
            .set('Cookie', 'refreshToken=old-refresh-token');

        expect(res.status).toBe(200);
        expect(res.headers['set-cookie']).toBeDefined();

        expect(res.headers['set-cookie']![0]).toContain('accessToken=new-access-token');
    });


    it('POST /api/auth/logout - Debería cerrar sesión y limpiar las cookies', async () => {
        vi.spyOn(tokenService, 'revokeRefreshToken').mockResolvedValue(undefined);

        const res = await request(app)
            .post('/api/auth/logout')
            .set('Cookie', 'refreshToken=valid-refresh-token');

        expect(res.status).toBe(200);


        expect(res.headers['set-cookie']).toBeDefined();
        expect(res.headers['set-cookie']![0]).toContain('accessToken=;');
    });
});
