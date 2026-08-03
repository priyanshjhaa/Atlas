import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
const migrationsFolder = process.env.MIGRATIONS_PATH ?? "/app/drizzle";
const sslMode = process.env.DATABASE_SSL_MODE ?? "disable";

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run database migrations.");
}

if (!["disable", "require", "verify-full"].includes(sslMode)) {
  throw new Error(
    "DATABASE_SSL_MODE must be one of: disable, require, verify-full.",
  );
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl:
    sslMode === "disable"
      ? undefined
      : { rejectUnauthorized: sslMode === "verify-full" },
});

async function runMigrations(): Promise<void> {
  try {
    await migrate(drizzle(pool), { migrationsFolder });
    console.log("Database migrations applied successfully.");
  } finally {
    await pool.end();
  }
}

void runMigrations().catch((error: unknown) => {
  console.error("Database migration failed.", error);
  process.exitCode = 1;
});
