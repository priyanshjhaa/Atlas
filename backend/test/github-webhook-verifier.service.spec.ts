import {
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Environment } from "../src/config/environment";
import { GitHubWebhookVerifierService } from "../src/connectors/github-webhook-verifier.service";

function verifier(secret: string | undefined) {
  const config = {
    get: () => secret,
  } as unknown as ConfigService<Environment, true>;
  return new GitHubWebhookVerifierService(config);
}

describe("GitHubWebhookVerifierService", () => {
  const body = Buffer.from('{"action":"created"}');
  const secret = "a sufficiently long webhook secret";

  it("accepts an authentic GitHub signature", () => {
    const signature = `sha256=${createHmac("sha256", secret)
      .update(body)
      .digest("hex")}`;

    expect(() => verifier(secret).verify(body, signature)).not.toThrow();
  });

  it("rejects a tampered body", () => {
    const signature = `sha256=${createHmac("sha256", secret)
      .update(body)
      .digest("hex")}`;

    expect(() =>
      verifier(secret).verify(Buffer.from("{}"), signature),
    ).toThrow(UnauthorizedException);
  });

  it("fails closed when the secret is not configured", () => {
    expect(() => verifier(undefined).verify(body, undefined)).toThrow(
      ServiceUnavailableException,
    );
  });
});
