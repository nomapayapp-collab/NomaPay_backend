// login.controller.ts
import type { Request, Response } from 'express';
import { loginUser } from '../services/login.service.js';
import { AppError } from '../errors/app-error.js';

export async function login(req: Request, res: Response) {
  try {
    const result = await loginUser(req.body);
    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    return res.status(500).json({ error: 'Error al iniciar sesión.' });
  }
}