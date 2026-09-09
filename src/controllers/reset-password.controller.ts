import type { Request, Response } from 'express';
import { requestPasswordReset, resetPassword } from '../services/reset-password.service.js';
import { AppError } from '../errors/app-error.js';

export async function forgotPasswordHandler(req: Request, res: Response) {
    try {
        const { email } = req.body;
        if (!email) {
            throw new AppError(400, 'El email es requerido.');
        }

        await requestPasswordReset(email);

        // Siempre devolvemos el mismo mensaje por seguridad (para que no puedan adivinar qué correos están registrados)
        return res.status(200).json({
            message: 'Si el email existe en nuestro sistema, te enviaremos un link para recuperar la contraseña.'
        });
    } catch (err: any) {
        if (err instanceof AppError) {
            return res.status(err.statusCode).json({ error: err.message });
        }
        console.error(err);
        return res.status(500).json({ error: 'Error interno del servidor.' });
    }
}

export async function resetPasswordHandler(req: Request, res: Response) {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            throw new AppError(400, 'El token y la nueva contraseña son requeridos.');
        }

        if (newPassword.length < 8) {
            throw new AppError(400, 'La nueva contraseña debe tener al menos 8 caracteres.');
        }

        await resetPassword(token, newPassword);

        return res.status(200).json({ message: 'Contraseña actualizada correctamente.' });
    } catch (err: any) {
        if (err instanceof AppError) {
            return res.status(err.statusCode).json({ error: err.message });
        }
        console.error(err);
        return res.status(500).json({ error: 'Error interno del servidor.' });
    }
}
