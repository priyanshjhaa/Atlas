import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import type { Environment } from "../config/environment";
import * as schema from "./schema";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;
  readonly client: NodePgDatabase<typeof schema>;

  constructor(config: ConfigService<Environment, true>) {
    const sslMode = config.get("DATABASE_SSL_MODE", { infer: true });
    this.pool = new Pool({
      connectionString: config.get("DATABASE_URL", { infer: true }),
      max: config.get("DATABASE_POOL_MAX", { infer: true }),
      connectionTimeoutMillis: config.get(
        "DATABASE_CONNECTION_TIMEOUT_MS",
        { infer: true },
      ),
      ssl:
        sslMode === "disable"
          ? undefined
          : { rejectUnauthorized: sslMode === "verify-full" },
    });
    this.client = drizzle(this.pool, { schema });
  }

  async ping(): Promise<void> {
    await this.client.execute(sql`select 1`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
