import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { verifyAccessToken } from '../utils/jwt.util.js';

export interface AuthenticatedRequest extends Request {
  user?: { userId: number; email: string };
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // Ahora buscamos el token en las cookies (gracias a cookie-parser)
  const token = req.cookies.accessToken;

  if (!token) {
    return res.status(401).json({ error: 'No autenticado. Falta la cookie.' });
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Tu access token expiró.', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Token inválido.' });
  }
}
