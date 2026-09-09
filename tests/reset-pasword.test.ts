import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import * as resetPasswordService from '../src/services/reset-password.service.js';
import { AppError } from '../src/errors/app-error.js';

describe('Reset Password Endpoints', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('POST /api/auth/forgot-password', () => {
        it('debería responder 400 si no se proporciona el email', async () => {
            const res = await request(app)
                .post('/api/auth/forgot-password')
                .send({});

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('El email es requerido.');
        });

        it('debería responder 200 y mensaje genérico de seguridad cuando se solicita reseteo', async () => {
            vi.spyOn(resetPasswordService, 'requestPasswordReset').mockResolvedValue(undefined);

            const res = await request(app)
                .post('/api/auth/forgot-password')
                .send({ email: 'user@nomapay.com' });

            expect(res.status).toBe(200);
            expect(res.body.message).toContain('Si el email existe en nuestro sistema');
            expect(resetPasswordService.requestPasswordReset).toHaveBeenCalledWith('user@nomapay.com');
        });
    });

    describe('POST /api/auth/reset-password', () => {
        it('debería responder 400 si falta el token o la nueva contraseña', async () => {
            const res = await request(app)
                .post('/api/auth/reset-password')
                .send({ token: 'sample-token' });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('El token y la nueva contraseña son requeridos.');
        });

        it('debería responder 400 si la contraseña tiene menos de 8 caracteres', async () => {
            const res = await request(app)
                .post('/api/auth/reset-password')
                .send({ token: 'sample-token', newPassword: 'short' });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('La nueva contraseña debe tener al menos 8 caracteres.');
        });

        it('debería responder 400 si el token es inválido o expiró', async () => {
            vi.spyOn(resetPasswordService, 'resetPassword').mockRejectedValue(
                new AppError(400, 'El link es inválido o ya ha sido usado.')
            );

            const res = await request(app)
                .post('/api/auth/reset-password')
                .send({ token: 'invalid-token', newPassword: 'ValidPassword123!' });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('El link es inválido o ya ha sido usado.');
        });

        it('debería responder 200 y mensaje de confirmación al resetear la contraseña con éxito', async () => {
            vi.spyOn(resetPasswordService, 'resetPassword').mockResolvedValue(undefined);

            const res = await request(app)
                .post('/api/auth/reset-password')
                .send({ token: 'valid-token', newPassword: 'NewValidPassword123!' });

            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Contraseña actualizada correctamente.');
            expect(resetPasswordService.resetPassword).toHaveBeenCalledWith('valid-token', 'NewValidPassword123!');
        });
    });
});
