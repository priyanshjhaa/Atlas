import type { ConnectionOptions } from "bullmq";

export function redisConnectionFromUrl(value: string): ConnectionOptions {
  const url = new URL(value);
  const database = url.pathname.slice(1);

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: database ? Number(database) : undefined,
    tls: url.protocol === "rediss:" ? {} : undefined,
  };
}
