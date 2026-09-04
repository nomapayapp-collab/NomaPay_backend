import type { Request, Response, NextFunction } from 'express';
import validator from 'validator';

export function validateRegister(req: Request, res: Response, next: NextFunction) {
  const { name, surname, country, email, password } = req.body;

  if (!name || !surname || !country || !email || !password) {
    return res.status(400).json({ error: 'Faltan campos obligatorios: name, surname, country, email, password.' });
  }
  if (!validator.isEmail(email)) {
    return res.status(400).json({ error: 'Email inválido.' });
  }
  if (password.length < 8 || password.length > 32) {
    return res.status(400).json({ error: 'La contraseña debe tener entre 8 y 32 caracteres.' });
  }

  if (!/[A-Z]/.test(password)) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos una mayúscula.' });
  }

  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos un carácter especial.' });
  }

  if (!/^[A-Za-z]{2}$/.test(country)) {
    return res.status(400).json({ error: 'El país debe ser un código ISO de 2 letras (ej: AR, BR, US).' });
  }

  next();
}