import type { Request, Response } from 'express';
import { registerWithGoogle, loginWithGoogle } from '../services/google.service.js';
import { AppError } from '../errors/app-error.js';

const isProduction = process.env.NODE_ENV === 'production';
const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'none' as const,
};

export async function registerWithGoogleController(req: Request, res: Response) {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ error: 'Falta el idToken de Google.' });
    }
    const result = await registerWithGoogle(idToken);

    res.cookie('accessToken', result.accessToken, cookieOptions);
    res.cookie('refreshToken', result.refreshToken, cookieOptions);

    return res.status(201).json(result.user);
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    return res.status(500).json({ error: 'Error al registrarse con Google.' });
  }
}

export async function loginWithGoogleController(req: Request, res: Response) {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ error: 'Falta el idToken de Google.' });
    }
    const result = await loginWithGoogle(idToken);

    res.cookie('accessToken', result.accessToken, cookieOptions);
    res.cookie('refreshToken', result.refreshToken, cookieOptions);

    return res.status(200).json(result.user);
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    return res.status(500).json({ error: 'Error al iniciar sesión con Google.' });
  }
}
