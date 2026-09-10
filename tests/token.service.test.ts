import { describe, it, expect, vi, beforeEach } from 'vitest';
import { refreshAccessToken, revokeRefreshToken } from '../src/services/token.service.js';
import { RefreshToken } from '../src/models/refresh-token.model.js';
import { User } from '../src/models/users.model.js';
import { ValidationError } from '../src/errors/app-error.js';

describe('Token Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('debería fallar si el refresh token no existe en la base de datos', async () => {
        vi.spyOn(RefreshToken, 'findOne').mockResolvedValue(null);

        await expect(refreshAccessToken('token-inexistente')).rejects.toThrow(ValidationError);
        await expect(refreshAccessToken('token-inexistente')).rejects.toThrow('Refresh token inválido.');
    });

    it('debería fallar si el refresh token ya fue revocado', async () => {
        const mockStoredToken = {
            tokenHash: 'hashed',
            revokedAt: new Date(),
            expiresAt: new Date(Date.now() + 100000),
            userId: 1,
        };
        vi.spyOn(RefreshToken, 'findOne').mockResolvedValue(mockStoredToken as any);

        await expect(refreshAccessToken('token-revocado')).rejects.toThrow('Refresh token revocado.');
    });

    it('debería fallar si el refresh token ya expiró', async () => {
        const mockStoredToken = {
            tokenHash: 'hashed',
            revokedAt: null,
            expiresAt: new Date(Date.now() - 10000),
            userId: 1,
        };
        vi.spyOn(RefreshToken, 'findOne').mockResolvedValue(mockStoredToken as any);

        await expect(refreshAccessToken('token-expirado')).rejects.toThrow('Refresh token expirado');
    });

    it('debería revocar el token anterior y emitir un par nuevo si es válido', async () => {
        const updateMock = vi.fn().mockResolvedValue(undefined);
        const mockStoredToken = {
            tokenHash: 'hashed',
            revokedAt: null,
            expiresAt: new Date(Date.now() + 1000000),
            userId: 1,
            update: updateMock,
        };
        const mockUser = {
            id: 1,
            email: 'user@nomapay.com',
        };

        vi.spyOn(RefreshToken, 'findOne').mockResolvedValue(mockStoredToken as any);
        vi.spyOn(User, 'findByPk').mockResolvedValue(mockUser as any);
        vi.spyOn(RefreshToken, 'create').mockResolvedValue({} as any);

        const result = await refreshAccessToken('token-valido');


        expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ revokedAt: expect.any(Date) }));

        expect(result).toHaveProperty('accessToken');
        expect(result).toHaveProperty('refreshToken');
    });

    it('revokeRefreshToken debería marcar el token como revocado', async () => {
        const updateMock = vi.fn().mockResolvedValue(undefined);
        const mockStoredToken = {
            tokenHash: 'hashed',
            revokedAt: null,
            update: updateMock,
        };
        vi.spyOn(RefreshToken, 'findOne').mockResolvedValue(mockStoredToken as any);

        await revokeRefreshToken('token-a-revocar');

        expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ revokedAt: expect.any(Date) }));
    });
});
