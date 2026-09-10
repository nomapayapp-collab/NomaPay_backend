import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcrypt';
import type { User as UserModel } from '../src/models/users.model.js';

vi.mock('../src/models/users.model.js', () => ({
    User: {
        findByPk: vi.fn(),
    },
}));

vi.mock('bcrypt', () => ({
    default: {
        compare: vi.fn(),
        hash: vi.fn(),
    },
}));

const { User } = await import('../src/models/users.model.js');
const { changePassword } = await import('../src/services/password.service.js');

interface MockUser {
    id: number;
    passwordHash: string | null;
    update: ReturnType<typeof vi.fn>;
}

function asUser(partial: unknown): UserModel {
    return partial as UserModel;
}


function createMockUser(overrides: Partial<MockUser> = {}): MockUser {
    return {
        id: 1,
        passwordHash: '$2b$10$hashedcurrentpassword',
        update: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

describe('password.service — changePassword', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('lanza NotFoundError si el usuario no existe', async () => {
        vi.mocked(User.findByPk).mockResolvedValue(null);

        await expect(
            changePassword(1, { currentPassword: 'OldPassword123!', newPassword: 'NewPassword123!' })
        ).rejects.toThrow('Usuario no encontrado.');

        expect(User.findByPk).toHaveBeenCalledWith(1);
        expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('lanza ValidationError si la cuenta no tiene contraseña propia (Google)', async () => {
        const mockUser = createMockUser({ passwordHash: null });
        vi.mocked(User.findByPk).mockResolvedValue(asUser(mockUser));

        await expect(
            changePassword(1, { currentPassword: 'OldPassword123!', newPassword: 'NewPassword123!' })
        ).rejects.toThrow(
            'Esta cuenta no tiene contraseña propia (se registró con Google). No se puede cambiar.'
        );

        expect(bcrypt.compare).not.toHaveBeenCalled();
        expect(mockUser.update).not.toHaveBeenCalled();
    });

    it('lanza ValidationError si la contraseña actual es incorrecta', async () => {
        const mockUser = createMockUser();
        vi.mocked(User.findByPk).mockResolvedValue(asUser(mockUser));
        vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

        await expect(
            changePassword(1, { currentPassword: 'WrongPassword123!', newPassword: 'NewPassword123!' })
        ).rejects.toThrow('La contraseña actual es incorrecta.');

        expect(bcrypt.compare).toHaveBeenCalledWith('WrongPassword123!', '$2b$10$hashedcurrentpassword');
        expect(mockUser.update).not.toHaveBeenCalled();
    });

    it('hashea la nueva contraseña y actualiza el usuario correctamente', async () => {
        const mockUser = createMockUser();
        vi.mocked(User.findByPk).mockResolvedValue(asUser(mockUser));
        vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
        vi.mocked(bcrypt.hash).mockResolvedValue('$2b$10$hashednewpassword' as never);

        await changePassword(1, {
            currentPassword: 'CorrectPassword123!',
            newPassword: 'NewPassword123!',
        });

        expect(bcrypt.compare).toHaveBeenCalledWith('CorrectPassword123!', '$2b$10$hashedcurrentpassword');
        expect(bcrypt.hash).toHaveBeenCalledWith('NewPassword123!', 10);
        expect(mockUser.update).toHaveBeenCalledWith({
            passwordHash: '$2b$10$hashednewpassword',
            passwordChangedAt: expect.any(Date),
        });
    });
});
