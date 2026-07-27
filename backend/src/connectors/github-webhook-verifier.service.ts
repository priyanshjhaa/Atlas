import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Environment } from "../config/environment";

@Injectable()
export class GitHubWebhookVerifierService {
  constructor(
    private readonly config: ConfigService<Environment, true>,
  ) {}

  verify(rawBody: Buffer, signature: string | undefined): void {
    const secret = this.config.get("GITHUB_APP_WEBHOOK_SECRET", {
      infer: true,
    });
    if (!secret) {
      throw new ServiceUnavailableException(
        "The GitHub App webhook secret is not configured.",
      );
    }
    if (!signature?.startsWith("sha256=")) {
      throw new UnauthorizedException("Missing GitHub webhook signature.");
    }

    const expected = Buffer.from(
      `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`,
    );
    const received = Buffer.from(signature);
    if (
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    ) {
      throw new UnauthorizedException("Invalid GitHub webhook signature.");
    }
  }
}
