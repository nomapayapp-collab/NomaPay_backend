// controllers/user.controller.ts
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { getUserProfile } from '../services/user.service.js';
import { AppError } from '../errors/app-error.js';

export async function getMe(req: AuthenticatedRequest, res: Response) {
  try {
    // req.user viene del middleware requireAuth, que ya lo validó antes de llegar acá
    const profile = await getUserProfile(req.user!.userId);
    return res.status(200).json(profile);
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener el perfil.' });
  }
}