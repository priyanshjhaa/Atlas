import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/database/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://atlas:atlas@localhost:5432/atlas",
  },
  migrations: {
    prefix: "timestamp",
  },
  strict: true,
  verbose: true,
});
