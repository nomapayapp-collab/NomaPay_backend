import bcrypt from 'bcrypt';
import { User } from '../models/users.model.js';
import { ValidationError } from '../errors/app-error.js';
import { issueTokenPair } from './token.service.js';
import type { RegisterUserResult } from './auth.service.js';

interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: RegisterUserResult;
}

export async function loginUser(input: LoginInput): Promise<AuthResult> {
  const { email, password } = input;

  const user = await User.findOne({ where: { email: email.toLowerCase().trim() } });

  if (!user || !user.passwordHash) {
    throw new ValidationError('Email o contraseña incorrectos.');
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    throw new ValidationError('Email o contraseña incorrectos.');
  }

  const { accessToken, refreshToken } = await issueTokenPair(user.id, user.email);

  return {
    accessToken,
    refreshToken,
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