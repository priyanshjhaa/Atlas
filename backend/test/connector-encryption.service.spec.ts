import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import type { Environment } from "../src/config/environment";
import { ConnectorEncryptionService } from "../src/connectors/connector-encryption.service";

function service(key = Buffer.alloc(32, 7).toString("base64")) {
  return new ConnectorEncryptionService(
    new ConfigService<Environment>({
      CONNECTOR_ENCRYPTION_KEY: key,
    }) as unknown as ConfigService<Environment, true>,
  );
}

describe("ConnectorEncryptionService", () => {
  it("round-trips encrypted connector credentials", () => {
    const encryption = service();
    const encrypted = encryption.encrypt({
      accessToken: "secret-access",
      refreshToken: "secret-refresh",
    });

    expect(encrypted).not.toContain("secret-access");
    expect(encryption.decrypt(encrypted)).toEqual({
      accessToken: "secret-access",
      refreshToken: "secret-refresh",
    });
  });

  it("rejects malformed and tampered credential payloads", () => {
    const encryption = service();
    expect(() => encryption.decrypt("not-an-envelope")).toThrow(
      "credential payload is invalid",
    );

    const encrypted = encryption.encrypt({ accessToken: "secret" });
    expect(() => service(Buffer.alloc(32, 8).toString("base64")).decrypt(encrypted))
      .toThrow("could not be decrypted");
  });
});
