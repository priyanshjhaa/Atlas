import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "node:crypto";
import type { Environment } from "../config/environment";
import type { AtlasRequest } from "../auth/auth.types";

@Injectable()
export class OperationsGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Environment, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const configuredToken = this.config.get("OPERATIONS_TOKEN", {
      infer: true,
    });
    const request = context.switchToHttp().getRequest<AtlasRequest>();
    const authorizationHeader = request.headers.authorization;
    const authorization = Array.isArray(authorizationHeader)
      ? authorizationHeader[0]
      : authorizationHeader;
    const presentedToken = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : "";

    if (
      !configuredToken ||
      !presentedToken ||
      !tokensMatch(configuredToken, presentedToken)
    ) {
      throw new UnauthorizedException("Operations authentication failed.");
    }

    return true;
  }
}

function tokensMatch(expected: string, presented: string): boolean {
  const expectedBytes = Buffer.from(expected);
  const presentedBytes = Buffer.from(presented);
  return (
    expectedBytes.length === presentedBytes.length &&
    timingSafeEqual(expectedBytes, presentedBytes)
  );
}
