// utils/jwt.util.ts
import jwt from 'jsonwebtoken';

interface JwtPayload {
  userId: number;
  email: string;
}

export function signJwt(payload: JwtPayload): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  } as jwt.SignOptions);
}

export function verifyJwt(token: string): JwtPayload {
  return jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
}