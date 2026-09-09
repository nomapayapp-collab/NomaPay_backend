
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { getUserHistory } from '../services/history.service.js';
import { AppError } from '../errors/app-error.js';

export async function getHistory(req: AuthenticatedRequest, res: Response) {
    try {
        const history = await getUserHistory(req.user!.userId);
        return res.status(200).json(history);
    } catch (err) {
        if (err instanceof AppError) {
            return res.status(err.statusCode).json({ error: err.message });
        }
        console.error('Error in getHistory:', err);
        return res.status(500).json({ error: 'Error al obtener el historial.' });
    }
}
