import { z } from "zod";

const environmentBoolean = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;
  return value;
}, z.boolean());

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
  NOTION_CLIENT_ID: z.string().min(1).optional(),
  NOTION_CLIENT_SECRET: z.string().min(1).optional(),
  NOTION_REDIRECT_URI: z.url().optional(),
  CONNECTOR_ENCRYPTION_KEY: z.string().min(1).optional(),
  SYNC_WORKER_CONCURRENCY: z.coerce.number().int().positive().max(20).default(2),
  REPOSITORY_STORAGE_PATH: z.string().min(1).default("/tmp/atlas-repositories"),
  PILOT_FEEDBACK_RETENTION_DAYS: z.coerce
    .number()
    .int()
    .positive()
    .max(3_650)
    .default(180),
  EMBEDDINGS_PROVIDER: z.enum(["local", "openai"]).default("local"),
  OPENAI_API_KEY: z.string().min(1).optional(),
  GROQ_API_KEY: z.string().min(1).optional(),
  LLM_EXPLANATIONS_ENABLED: environmentBoolean.default(false),
  LLM_PROVIDER: z.enum(["openai", "groq"]).default("openai"),
  LLM_BASE_URL: z.url().optional(),
  LLM_EXPLANATION_MODEL: z.string().trim().optional(),
  LLM_FALLBACK_MODEL: z.string().trim().optional(),
  LLM_EXPLANATION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .max(120_000)
    .default(15_000),
  LLM_MAX_EVIDENCE_ITEMS: z.coerce
    .number()
    .int()
    .positive()
    .max(100)
    .default(12),
  LLM_MAX_EVIDENCE_CHARACTERS: z.coerce
    .number()
    .int()
    .positive()
    .max(200_000)
    .default(10_000),
  LLM_MAX_PACKET_CHARACTERS: z.coerce
    .number()
    .int()
    .positive()
    .max(200_000)
    .default(14_000),
  LLM_MAX_OUTPUT_TOKENS: z.coerce
    .number()
    .int()
    .positive()
    .max(32_768)
    .default(2_000),
  LLM_REASONING_EFFORT: z.enum(["low", "medium", "high"]).default("low"),
  LLM_MAX_EXPLANATION_CHARACTERS: z.coerce
    .number()
    .int()
    .positive()
    .max(100_000)
    .default(20_000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
}).superRefine((environment, context) => {
  const githubValues = [
    environment.GITHUB_APP_ID,
    environment.GITHUB_APP_PRIVATE_KEY,
    environment.GITHUB_APP_WEBHOOK_SECRET,
  ];
  const configured = githubValues.filter(Boolean).length;
  if (
    configured > 0 &&
    (configured < githubValues.length || !environment.CONNECTOR_ENCRYPTION_KEY)
  ) {
    context.addIssue({
      code: "custom",
      message: "All GitHub App and connector encryption values are required together.",
      path: ["GITHUB_APP_ID"],
    });
  }
  const notionValues = [
    environment.NOTION_CLIENT_ID,
    environment.NOTION_CLIENT_SECRET,
  ];
  const notionConfigured = notionValues.filter(Boolean).length;
  if (notionConfigured > 0 && notionConfigured < notionValues.length) {
    context.addIssue({
      code: "custom",
      message: "NOTION_CLIENT_ID and NOTION_CLIENT_SECRET are required together.",
      path: ["NOTION_CLIENT_ID"],
    });
  }
  if (notionConfigured === notionValues.length && !environment.CONNECTOR_ENCRYPTION_KEY) {
    context.addIssue({
      code: "custom",
      message: "CONNECTOR_ENCRYPTION_KEY is required when Notion is configured.",
      path: ["CONNECTOR_ENCRYPTION_KEY"],
    });
  }
  if (environment.EMBEDDINGS_PROVIDER === "openai" && !environment.OPENAI_API_KEY) {
    context.addIssue({
      code: "custom",
      message: "OPENAI_API_KEY is required when EMBEDDINGS_PROVIDER is openai.",
      path: ["OPENAI_API_KEY"],
    });
  }
  if (environment.LLM_EXPLANATIONS_ENABLED) {
    if (!environment.LLM_EXPLANATION_MODEL) {
      context.addIssue({
        code: "custom",
        message:
          "LLM_EXPLANATION_MODEL is required when LLM explanations are enabled.",
        path: ["LLM_EXPLANATION_MODEL"],
      });
    }
    if (
      environment.LLM_FALLBACK_MODEL &&
      environment.LLM_PROVIDER !== "groq"
    ) {
      context.addIssue({
        code: "custom",
        message: "LLM_FALLBACK_MODEL is supported only when LLM_PROVIDER is groq.",
        path: ["LLM_FALLBACK_MODEL"],
      });
    }
    if (
      environment.LLM_FALLBACK_MODEL &&
      environment.LLM_FALLBACK_MODEL === environment.LLM_EXPLANATION_MODEL
    ) {
      context.addIssue({
        code: "custom",
        message: "LLM_FALLBACK_MODEL must differ from LLM_EXPLANATION_MODEL.",
        path: ["LLM_FALLBACK_MODEL"],
      });
    }
    const providerKey =
      environment.LLM_PROVIDER === "groq"
        ? environment.GROQ_API_KEY
        : environment.OPENAI_API_KEY;
    if (!providerKey) {
      const keyName =
        environment.LLM_PROVIDER === "groq"
          ? "GROQ_API_KEY"
          : "OPENAI_API_KEY";
      context.addIssue({
        code: "custom",
        message: `${keyName} is required when LLM explanations use ${environment.LLM_PROVIDER}.`,
        path: [keyName],
      });
    }
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
