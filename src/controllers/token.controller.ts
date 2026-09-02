import type { Request, Response } from 'express';
import { refreshAccessToken, revokeRefreshToken } from '../services/token.service.js';
import { AppError } from '../errors/app-error.js';

const isProduction = process.env.NODE_ENV === 'production';
const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'none' as const,
};

export async function refresh(req: Request, res: Response) {
  try {
    // Ahora leemos el refresh token desde la cookie
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ error: 'Falta el refreshToken en las cookies.' });
    }
    const result = await refreshAccessToken(refreshToken);

    // Setear nuevamente las cookies con los tokens renovados
    res.cookie('accessToken', result.accessToken, cookieOptions);
    res.cookie('refreshToken', result.refreshToken, cookieOptions);

    return res.status(200).json({ message: 'Tokens renovados' });
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    return res.status(500).json({ error: 'Error al renovar la sesión.' });
  }
}

export async function logout(req: Request, res: Response) {
  try {
    // Leemos el refresh token desde la cookie
    const refreshToken = req.cookies.refreshToken;

    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }

    // Borramos ambas cookies del navegador
    res.clearCookie('accessToken', cookieOptions);
    res.clearCookie('refreshToken', cookieOptions);

    return res.status(200).json({ message: 'Sesión cerrada correctamente.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al cerrar sesión.' });
  }
}
