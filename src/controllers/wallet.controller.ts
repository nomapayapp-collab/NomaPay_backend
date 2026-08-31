// controllers/wallet.controller.ts
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { getWalletSummary, updatePreferredCurrency } from '../services/wallet.service.js';
import { AppError } from '../errors/app-error.js';

export async function getMyWallet(req: AuthenticatedRequest, res: Response) {
  try {
    const summary = await getWalletSummary(req.user!.userId);
    return res.status(200).json(summary);
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener la wallet.' });
  }
}

export async function patchPreferredCurrency(req: AuthenticatedRequest, res: Response) {
  try {
    const { preferredCurrency } = req.body;
    if (!preferredCurrency) {
      return res.status(400).json({ error: 'Falta el campo preferredCurrency.' });
    }
    const summary = await updatePreferredCurrency(req.user!.userId, preferredCurrency);
    return res.status(200).json(summary);
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    return res.status(500).json({ error: 'Error al actualizar la moneda preferida.' });
  }
}