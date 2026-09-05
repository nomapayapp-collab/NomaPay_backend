// controllers/deposit.controller.ts
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { depositFunds } from '../services/deposit.service.js';
import { AppError } from '../errors/app-error.js';

export async function postDeposit(req: AuthenticatedRequest, res: Response) {
    try {
        const { currencyCode, amount } = req.body;

        if (!currencyCode || amount === undefined || amount === null) {
            return res.status(400).json({ error: 'Falta elegir la moneda o ingresar el monto.' });
        }

        // El usuario viene del middleware de autenticación
        const result = await depositFunds(req.user!.userId, {
            currencyCode,
            amount: Number(amount)
        });

        return res.status(201).json(result);
    } catch (err) {
        if (err instanceof AppError) {
            return res.status(err.statusCode).json({ error: err.message });
        }
        console.error('Error in postDeposit:', err);
        return res.status(500).json({ error: 'Error al procesar el depósito.' });
    }
}
