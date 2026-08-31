
import type { Request, Response } from 'express';
import { registerUser } from '../services/auth.service.js';
import { AppError } from '../errors/app-error.js';

export async function register(req: Request, res: Response) {
  try {
    const user = await registerUser(req.body);
    return res.status(201).json(user);
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    return res.status(500).json({ error: 'Error al crear la cuenta.' });
  }
}