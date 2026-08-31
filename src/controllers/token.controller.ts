
import type { Request, Response } from 'express';
import { refreshAccessToken, revokeRefreshToken } from '../services/token.service.js';
import { AppError } from '../errors/app-error.js';

export async function refresh(req: Request, res: Response) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Falta el refreshToken.' });
    }
    const tokens = await refreshAccessToken(refreshToken);
    return res.status(200).json(tokens);
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
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Falta el refreshToken.' });
    }
    await revokeRefreshToken(refreshToken);
    return res.status(200).json({ message: 'Sesión cerrada correctamente.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al cerrar sesión.' });
  }
}