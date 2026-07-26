import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().max(65_535).default(4000),
  FRONTEND_ORIGIN: z.url().default("http://localhost:3000"),
  DATABASE_URL: z.url().default("postgresql://atlas:atlas@localhost:5432/atlas"),
  REDIS_URL: z.url().default("redis://localhost:6379"),
  AUTH_JWKS_URL: z
    .url()
    .default("http://localhost:3000/api/auth/jwks"),
  AUTH_ISSUER: z.url().default("http://localhost:3000"),
  AUTH_AUDIENCE: z.url().default("http://localhost:4000"),
  GITHUB_APP_ID: z.string().min(1).optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().min(1).optional(),
  GITHUB_APP_WEBHOOK_SECRET: z.string().min(16).optional(),
  CONNECTOR_ENCRYPTION_KEY: z.string().min(1).optional(),
  SYNC_WORKER_CONCURRENCY: z.coerce.number().int().positive().max(20).default(2),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
}).superRefine((environment, context) => {
  const githubValues = [
    environment.GITHUB_APP_ID,
    environment.GITHUB_APP_PRIVATE_KEY,
    environment.GITHUB_APP_WEBHOOK_SECRET,
    environment.CONNECTOR_ENCRYPTION_KEY,
  ];
  const configured = githubValues.filter(Boolean).length;
  if (configured > 0 && configured < githubValues.length) {
    context.addIssue({
      code: "custom",
      message: "All GitHub App and connector encryption values are required together.",
      path: ["GITHUB_APP_ID"],
    });
  }
});

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(values: Record<string, unknown>): Environment {
  const result = environmentSchema.safeParse(values);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid backend environment: ${details}`);
  }

  return result.data;
}
