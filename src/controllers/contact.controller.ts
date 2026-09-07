
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { getFrequentContacts } from '../services/contact.service.js';
import { AppError } from '../errors/app-error.js';

export async function getContacts(req: AuthenticatedRequest, res: Response) {
    try {
        const contacts = await getFrequentContacts(req.user!.userId);
        return res.status(200).json(contacts);
    } catch (err) {
        if (err instanceof AppError) {
            return res.status(err.statusCode).json({ error: err.message });
        }
        console.error('Error in getContacts:', err);
        return res.status(500).json({ error: 'Error al obtener contactos frecuentes.' });
    }
}
