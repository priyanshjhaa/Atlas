import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./auth-schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required for Atlas authentication.");
}

const globalDatabase = globalThis as typeof globalThis & {
  atlasPool?: Pool;
};

const pool =
  globalDatabase.atlasPool ??
  new Pool({
    connectionString,
    max: process.env.NODE_ENV === "production" ? 10 : 5,
  });

if (process.env.NODE_ENV !== "production") {
  globalDatabase.atlasPool = pool;
}

export const db = drizzle(pool, { schema });
