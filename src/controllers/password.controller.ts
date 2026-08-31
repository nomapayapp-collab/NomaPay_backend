
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { changePassword } from '../services/password.service.js';
import { AppError } from '../errors/app-error.js';

export async function patchPassword(req: AuthenticatedRequest, res: Response) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Faltan currentPassword o newPassword.' });
    }
    await changePassword(req.user!.userId, { currentPassword, newPassword });
    return res.status(200).json({ message: 'Contraseña actualizada correctamente.' });
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    return res.status(500).json({ error: 'Error al cambiar la contraseña.' });
  }
}