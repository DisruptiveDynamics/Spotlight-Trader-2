import { z } from 'zod';

export const startAuthSchema = z.object({
  email: z.string().email(),
});

export const callbackQuerySchema = z.object({
  token: z.string().min(1),
});

export interface User {
  id: string;
  email: string;
  createdAt: Date;
}

export interface Session {
  id: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface MagicLink {
  id: string;
  email: string;
  token: string;
  expiresAt: Date;
  used: boolean;
  createdAt: Date;
}
