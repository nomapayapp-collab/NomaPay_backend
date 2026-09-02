import type { Request, Response } from 'express';
import { loginUser } from '../services/login.service.js';
import { AppError } from '../errors/app-error.js';

export async function login(req: Request, res: Response) {
  try {
    const result = await loginUser(req.body);

    const isProduction = process.env.NODE_ENV === 'production';
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction, // En Railway será true
      sameSite: 'none' as const, // Necesario si Vercel y Railway están en dominios distintos
    };

    res.cookie('accessToken', result.accessToken, cookieOptions);
    res.cookie('refreshToken', result.refreshToken, cookieOptions);

    // Solo devolvemos los datos del usuario, sin los tokens
    return res.status(200).json(result.user);
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    return res.status(500).json({ error: 'Error al iniciar sesión.' });
  }
}
