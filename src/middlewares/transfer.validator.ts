// middlewares/transfer.validator.ts
import type { Request, Response, NextFunction } from 'express';

export function validateTransfer(req: Request, res: Response, next: NextFunction) {
  const { aliasOrCbu, currencyCode, amount, message } = req.body;

  if (!aliasOrCbu || typeof aliasOrCbu !== 'string') {
    return res.status(400).json({ error: 'Falta ingresar el alias o CBU de destino.' });
  }

  if (!currencyCode || typeof currencyCode !== 'string') {
    return res.status(400).json({ error: 'Falta elegir la moneda (currencyCode).' });
  }

  const numAmount = Number(amount);
  if (!Number.isFinite(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: 'El monto a transferir debe ser mayor a 0.' });
  }
  if (message !== undefined) {
    if (typeof message !== 'string') {
      return res.status(400).json({ error: 'El mensaje debe ser texto.' });
    }
    if (message.length > 100) {
      return res.status(400).json({ error: 'El mensaje no puede superar los 100 caracteres.' });
    }
  }
  next();
}
