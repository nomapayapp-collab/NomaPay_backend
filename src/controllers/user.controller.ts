// controllers/user.controller.ts
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { getUserProfile, updateUserProfile, updateTheme, deleteUserAccount } from '../services/user.service.js';
import { AppError } from '../errors/app-error.js';

export async function getMe(req: AuthenticatedRequest, res: Response) {
  try {
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

export async function patchMe(req: AuthenticatedRequest, res: Response) {
  try {
    const profile = await updateUserProfile(req.user!.userId, req.body);
    return res.status(200).json(profile);
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    return res.status(500).json({ error: 'Error al actualizar el perfil.' });
  }
}

export async function patchTheme(req: AuthenticatedRequest, res: Response) {
  try {
    const { theme } = req.body;

    // Validamos rápido que solo mande light o dark
    if (theme !== 'light' && theme !== 'dark') {
      return res.status(400).json({ error: 'El theme debe ser "light" o "dark".' });
    }

    const profile = await updateTheme(req.user!.userId, theme);
    return res.status(200).json(profile);
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    return res.status(500).json({ error: 'Error al actualizar el tema.' });
  }
}
export async function deleteMe(req: AuthenticatedRequest, res: Response) {
  try {
    await deleteUserAccount(req.user!.userId);

    // Le borramos la cookie para hacerle logout instantáneo
    res.clearCookie('accessToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });

    return res.status(200).json({ message: 'Cuenta eliminada correctamente.' });
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Error in deleteMe:', err);
    return res.status(500).json({ error: 'Error al eliminar la cuenta.' });
  }
}
