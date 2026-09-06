
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { transferFunds } from '../services/transfer.service.js';
import { AppError } from '../errors/app-error.js';

export async function postTransfer(req: AuthenticatedRequest, res: Response) {
    try {
        const { aliasOrCbu, currencyCode, amount } = req.body;

        const result = await transferFunds(req.user!.userId, {
            aliasOrCbu,
            currencyCode,
            amount: Number(amount),
        });

        return res.status(201).json(result);
    } catch (err) {
        if (err instanceof AppError) {
            return res.status(err.statusCode).json({ error: err.message });
        }
        console.error('Error in postTransfer:', err);
        return res.status(500).json({ error: 'Error interno al procesar la transferencia.' });
    }
}
