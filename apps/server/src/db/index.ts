import { neon } from "@neondatabase/serverless";
import { validateEnv } from "@shared/env";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

const env = validateEnv(process.env);
const sql = neon(env.DATABASE_URL);

export const db = drizzle(sql, { schema });
