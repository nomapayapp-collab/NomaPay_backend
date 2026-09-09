import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import * as userService from '../src/services/user.service.js';
import * as passwordService from '../src/services/password.service.js';
import { NotFoundError, ValidationError, ConflictError } from '../src/errors/app-error.js';
import type { UserProfile } from '../src/services/user.service.js';

vi.mock('jsonwebtoken');

type SyncJwtVerify = (token: string, secretOrPublicKey: jwt.Secret) => jwt.JwtPayload;
const verifyMock = vi.mocked(jwt.verify as unknown as SyncJwtVerify);

const mockProfile: UserProfile = {
    id: 1,
    name: 'Gisella',
    surname: 'Fernández',
    email: 'gisella@nomapay.com',
    username: 'gisella.f',
    alias: 'gisella.noma',
    cbu: '1234567890123456789012',
    country: 'AR',
    profilePictureUrl: 'https://example.com/avatar.png',
    theme: 'light',
};

describe('User Endpoints', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('GET /api/users/me', () => {
        it('debería responder 401 si no se envía la cookie de autenticación', async () => {
            const res = await request(app).get('/api/users/me');
            expect(res.status).toBe(401);
            expect(res.body.error).toContain('No autenticado');
        });

        it('debería responder 404 si el usuario no existe', async () => {
            verifyMock.mockReturnValue({ userId: 1, email: 'gisella@nomapay.com' });
            vi.spyOn(userService, 'getUserProfile').mockRejectedValue(
                new NotFoundError('Usuario no encontrado.')
            );

            const res = await request(app)
                .get('/api/users/me')
                .set('Cookie', 'accessToken=valid-token');

            expect(res.status).toBe(404);
            expect(res.body.error).toBe('Usuario no encontrado.');
        });

        it('debería responder 200 y devolver el perfil del usuario autenticado', async () => {
            verifyMock.mockReturnValue({ userId: 1, email: 'gisella@nomapay.com' });
            vi.spyOn(userService, 'getUserProfile').mockResolvedValue(mockProfile);

            const res = await request(app)
                .get('/api/users/me')
                .set('Cookie', 'accessToken=valid-token');

            expect(res.status).toBe(200);
            expect(res.body).toEqual(mockProfile);
        });
    });

    describe('PATCH /api/users/me', () => {
        it('debería responder 401 si no está autenticado', async () => {
            const res = await request(app)
                .patch('/api/users/me')
                .send({ country: 'BR' });

            expect(res.status).toBe(401);
        });

        it('debería responder 400 si se intentan modificar campos inmutables', async () => {
            verifyMock.mockReturnValue({ userId: 1, email: 'gisella@nomapay.com' });
            vi.spyOn(userService, 'updateUserProfile').mockRejectedValue(
                new ValidationError('No podés modificar el/los siguiente(s) campo(s): email.')
            );

            const res = await request(app)
                .patch('/api/users/me')
                .set('Cookie', 'accessToken=valid-token')
                .send({ email: 'nuevo@nomapay.com' });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('No podés modificar');
        });

        it('debería responder 409 si el username o alias ya está en uso', async () => {
            verifyMock.mockReturnValue({ userId: 1, email: 'gisella@nomapay.com' });
            vi.spyOn(userService, 'updateUserProfile').mockRejectedValue(
                new ConflictError('Ese username ya está en uso.')
            );

            const res = await request(app)
                .patch('/api/users/me')
                .set('Cookie', 'accessToken=valid-token')
                .send({ username: 'usuario.duplicado' });

            expect(res.status).toBe(409);
            expect(res.body.error).toBe('Ese username ya está en uso.');
        });

        it('debería responder 200 y devolver el perfil actualizado', async () => {
            verifyMock.mockReturnValue({ userId: 1, email: 'gisella@nomapay.com' });
            const updatedProfile: UserProfile = { ...mockProfile, alias: 'nuevo.alias' };
            vi.spyOn(userService, 'updateUserProfile').mockResolvedValue(updatedProfile);

            const res = await request(app)
                .patch('/api/users/me')
                .set('Cookie', 'accessToken=valid-token')
                .send({ alias: 'nuevo.alias' });

            expect(res.status).toBe(200);
            expect(res.body.alias).toBe('nuevo.alias');
        });
    });

    describe('PATCH /api/users/me/password', () => {
        it('debería responder 401 si no está autenticado', async () => {
            const res = await request(app)
                .patch('/api/users/me/password')
                .send({ currentPassword: 'OldPassword123!', newPassword: 'NewPassword123!' });

            expect(res.status).toBe(401);
        });

        it('debería responder 400 si faltan datos requeridos', async () => {
            verifyMock.mockReturnValue({ userId: 1, email: 'gisella@nomapay.com' });

            const res = await request(app)
                .patch('/api/users/me/password')
                .set('Cookie', 'accessToken=valid-token')
                .send({ currentPassword: 'OldPassword123!' });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('Faltan currentPassword o newPassword.');
        });

        it('debería responder 200 si la contraseña se actualizó correctamente', async () => {
            verifyMock.mockReturnValue({ userId: 1, email: 'gisella@nomapay.com' });
            vi.spyOn(passwordService, 'changePassword').mockResolvedValue(undefined);

            const res = await request(app)
                .patch('/api/users/me/password')
                .set('Cookie', 'accessToken=valid-token')
                .send({ currentPassword: 'OldPassword123!', newPassword: 'NewPassword123!' });

            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Contraseña actualizada correctamente.');
        });
    });

    describe('PATCH /api/users/me/theme', () => {
        it('debería responder 401 si no está autenticado', async () => {
            const res = await request(app)
                .patch('/api/users/me/theme')
                .send({ theme: 'dark' });

            expect(res.status).toBe(401);
        });

        it('debería responder 400 si el tema no es "light" o "dark"', async () => {
            verifyMock.mockReturnValue({ userId: 1, email: 'gisella@nomapay.com' });

            const res = await request(app)
                .patch('/api/users/me/theme')
                .set('Cookie', 'accessToken=valid-token')
                .send({ theme: 'blue' });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('El theme debe ser "light" o "dark".');
        });

        it('debería responder 200 y actualizar el tema con éxito', async () => {
            verifyMock.mockReturnValue({ userId: 1, email: 'gisella@nomapay.com' });
            const updatedProfile: UserProfile = { ...mockProfile, theme: 'dark' };
            vi.spyOn(userService, 'updateTheme').mockResolvedValue(updatedProfile);

            const res = await request(app)
                .patch('/api/users/me/theme')
                .set('Cookie', 'accessToken=valid-token')
                .send({ theme: 'dark' });

            expect(res.status).toBe(200);
            expect(res.body.theme).toBe('dark');
        });
    });

    describe('DELETE /api/users/me', () => {
        it('debería responder 401 si no está autenticado', async () => {
            const res = await request(app).delete('/api/users/me');
            expect(res.status).toBe(401);
        });

        it('debería responder 400 si el usuario tiene saldo a favor', async () => {
            verifyMock.mockReturnValue({ userId: 1, email: 'gisella@nomapay.com' });
            vi.spyOn(userService, 'deleteUserAccount').mockRejectedValue(
                new ValidationError('No podés eliminar tu cuenta porque tenés saldo a favor. Transferilo o cambialo antes de darte de baja.')
            );

            const res = await request(app)
                .delete('/api/users/me')
                .set('Cookie', 'accessToken=valid-token');

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('saldo a favor');
        });

        it('debería responder 200, limpiar la cookie accessToken y eliminar la cuenta', async () => {
            verifyMock.mockReturnValue({ userId: 1, email: 'gisella@nomapay.com' });
            vi.spyOn(userService, 'deleteUserAccount').mockResolvedValue(undefined);

            const res = await request(app)
                .delete('/api/users/me')
                .set('Cookie', 'accessToken=valid-token');

            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Cuenta eliminada correctamente.');
            expect(res.headers['set-cookie']).toBeDefined();
            expect(res.headers['set-cookie']?.[0]).toContain('accessToken=;');
        });
    });
});
