import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { Environment } from "../config/environment";

@Injectable()
export class ConnectorEncryptionService {
  constructor(private readonly config: ConfigService<Environment, true>) {}

  encrypt(value: Record<string, unknown>): string {
    const key = this.key();

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

  decrypt<T extends Record<string, unknown>>(value: string): T {
    const [version, encodedIv, encodedTag, encodedCiphertext, extra] =
      value.split(".");
    if (
      version !== "v1" ||
      !encodedIv ||
      !encodedTag ||
      !encodedCiphertext ||
      extra
    ) {
      throw new ServiceUnavailableException(
        "The connector credential payload is invalid.",
      );
    }

    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.key(),
        Buffer.from(encodedIv, "base64url"),
      );
      decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(encodedCiphertext, "base64url")),
        decipher.final(),
      ]);
      return JSON.parse(plaintext.toString("utf8")) as T;
    } catch {
      throw new ServiceUnavailableException(
        "The connector credential payload could not be decrypted.",
      );
    }
  }

  private key(): Buffer {
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
    return key;
  }
}
