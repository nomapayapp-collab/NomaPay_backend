import bcrypt from 'bcrypt';
import { User } from '../models/users.model.js';
import { ValidationError } from '../errors/app-error.js';
import { signJwt } from '../utils/jwt.util.js';
import type { RegisterUserResult } from './auth.service.js';

interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResult {
  token: string;
  user: RegisterUserResult;
}

export async function loginUser(input: LoginInput): Promise<AuthResult> {
  const { email, password } = input;

  const user = await User.findOne({ where: { email: email.toLowerCase().trim() } });

  // Mismo mensaje genérico tanto si el email no existe como si la contraseña
  // es incorrecta, para no filtrar qué emails están registrados.
  if (!user || !user.passwordHash) {
    throw new ValidationError('Email o contraseña incorrectos.');
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    throw new ValidationError('Email o contraseña incorrectos.');
  }

  const token = signJwt({ userId: user.id, email: user.email });

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      surname: user.surname,
      email: user.email,
      username: user.username as string,
      alias: user.alias as string,
      cbu: user.cbu,
    },
  };
}