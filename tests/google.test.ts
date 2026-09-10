import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import * as googleService from '../src/services/google.service.js';
import { ConflictError, NotFoundError } from '../src/errors/app-error.js';
import type { RegisterUserResult } from '../src/services/auth.service.js';

describe('Google Auth Endpoints', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const mockUser: RegisterUserResult = {
        id: 1,
        email: 'googleuser@gmail.com',
        name: 'Google',
        surname: 'User',
        username: 'google.user',
        alias: 'google.user',
        cbu: '1234567890123456789012',
    };

    describe('POST /api/auth/google/register', () => {
        it('debería responder 400 si falta el idToken', async () => {
            const res = await request(app)
                .post('/api/auth/google/register')
                .send({});

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('Falta el idToken');
        });

        it('debería responder 409 si el usuario ya existe', async () => {
            vi.spyOn(googleService, 'registerWithGoogle').mockRejectedValue(
                new ConflictError('Ya existe una cuenta con este email.')
            );

            const res = await request(app)
                .post('/api/auth/google/register')
                .send({ idToken: 'fake-google-id-token' });

            expect(res.status).toBe(409);
            expect(res.body.error).toContain('Ya existe una cuenta');
        });

        it('debería registrar al usuario exitosamente y setear cookies', async () => {
            vi.spyOn(googleService, 'registerWithGoogle').mockResolvedValue({
                accessToken: 'google-access-token',
                refreshToken: 'google-refresh-token',
                user: mockUser,
            });

            const res = await request(app)
                .post('/api/auth/google/register')
                .send({ idToken: 'valid-google-id-token' });

            expect(res.status).toBe(201);
            expect(res.body.email).toBe('googleuser@gmail.com');
            expect(res.headers['set-cookie']).toBeDefined();
            expect(res.headers['set-cookie']![0]).toContain('accessToken=google-access-token');
        });
    });

    describe('POST /api/auth/google/login', () => {
        it('debería responder 400 si falta el idToken', async () => {
            const res = await request(app)
                .post('/api/auth/google/login')
                .send({});

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('Falta el idToken');
        });

        it('debería responder 404 si el usuario no existe', async () => {
            vi.spyOn(googleService, 'loginWithGoogle').mockRejectedValue(
                new NotFoundError('No existe una cuenta con este email. Registrate primero.')
            );

            const res = await request(app)
                .post('/api/auth/google/login')
                .send({ idToken: 'fake-google-id-token' });

            expect(res.status).toBe(404);
            expect(res.body.error).toContain('No existe una cuenta');
        });

        it('debería iniciar sesión exitosamente y setear cookies', async () => {
            vi.spyOn(googleService, 'loginWithGoogle').mockResolvedValue({
                accessToken: 'google-access-token',
                refreshToken: 'google-refresh-token',
                user: mockUser,
            });

            const res = await request(app)
                .post('/api/auth/google/login')
                .send({ idToken: 'valid-google-id-token' });

            expect(res.status).toBe(200);
            expect(res.body.email).toBe('googleuser@gmail.com');
            expect(res.headers['set-cookie']).toBeDefined();
            expect(res.headers['set-cookie']![0]).toContain('accessToken=google-access-token');
        });
    });
});
