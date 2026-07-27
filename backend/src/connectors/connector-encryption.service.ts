import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, randomBytes } from "node:crypto";
import type { Environment } from "../config/environment";

@Injectable()
export class ConnectorEncryptionService {
  constructor(private readonly config: ConfigService<Environment, true>) {}

  encrypt(value: Record<string, unknown>): string {
    const encodedKey = this.config.get("CONNECTOR_ENCRYPTION_KEY", {
      infer: true,
    });
    if (!encodedKey) {
      throw new ServiceUnavailableException(
        "The connector encryption key is not configured.",
      );
    }

    const key = Buffer.from(encodedKey, "base64");
    if (key.length !== 32) {
      throw new ServiceUnavailableException(
        "CONNECTOR_ENCRYPTION_KEY must decode to exactly 32 bytes.",
      );
    }

    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(value), "utf8"),
      cipher.final(),
    ]);

    return [
      "v1",
      iv.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      ciphertext.toString("base64url"),
    ].join(".");
  }
}
