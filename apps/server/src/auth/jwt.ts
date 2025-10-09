import jwt from 'jsonwebtoken';
import { validateEnv } from '@shared/env';

const env = validateEnv(process.env);

export interface JwtPayload {
  userId: string;
  email: string;
}

export function signJwt(payload: JwtPayload, ttlSeconds: number): string {
  return jwt.sign(payload, env.AUTH_JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: ttlSeconds,
  });
}

export function verifyJwt(token: string): JwtPayload | null {
  try {
    const payload = jwt.verify(token, env.AUTH_JWT_SECRET, {
      algorithms: ['HS256'],
    }) as JwtPayload;
    return payload;
  } catch (error) {
    return null;
  }
}
