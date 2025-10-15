import { validateEnv } from "@shared/env";
import jwt from "jsonwebtoken";

const env = validateEnv(process.env);

export interface VoiceTokenPayload {
  userId: string;
  exp: number;
}

export function signVoiceToken(userId: string, ttlSeconds = 60): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;

  const payload: VoiceTokenPayload = {
    userId,
    exp,
  };

  return jwt.sign(payload, env.SESSION_SECRET, { algorithm: "HS256" });
}

export function verifyVoiceToken(token: string): VoiceTokenPayload {
  try {
    const decoded = jwt.verify(token, env.SESSION_SECRET, {
      algorithms: ["HS256"],
    }) as VoiceTokenPayload;

    if (decoded.exp < Math.floor(Date.now() / 1000)) {
      throw new Error("Token expired");
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error(`Invalid token: ${error.message}`);
    }
    throw error;
  }
}
