// services/token.service.ts
import { RefreshToken } from '../models/refresh-token.model.js';
import { User } from '../models/users.model.js';
import { generateRefreshToken, hashToken, signAccessToken } from '../utils/jwt.util.js';
import { ValidationError } from '../errors/app-error.js';

const REFRESH_TOKEN_DAYS = Number(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS ?? 30);

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export async function issueTokenPair(userId: number, email: string): Promise<TokenPair> {
  const accessToken = signAccessToken({ userId, email });

  const refreshToken = generateRefreshToken();
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

  await RefreshToken.create({ userId, tokenHash, expiresAt, revokedAt: null });

  return { accessToken, refreshToken };
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenPair> {
  const tokenHash = hashToken(refreshToken);

  const stored = await RefreshToken.findOne({ where: { tokenHash } });

  if (!stored) {
    throw new ValidationError('Refresh token inválido.');
  }
  if (stored.revokedAt) {
    throw new ValidationError('Refresh token revocado.');
  }
  if (new Date() > stored.expiresAt) {
    throw new ValidationError('Refresh token expirado, iniciá sesión de nuevo.');
  }

  const user = await User.findByPk(stored.userId);
  if (!user) {
    throw new ValidationError('Usuario no encontrado.');
  }


  await stored.update({ revokedAt: new Date() });

  return issueTokenPair(user.id, user.email);
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const tokenHash = hashToken(refreshToken);
  const stored = await RefreshToken.findOne({ where: { tokenHash } });

  if (stored && !stored.revokedAt) {
    await stored.update({ revokedAt: new Date() });
  }

}