import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";
import type { Environment } from "../config/environment";

export interface AtlasJwtClaims extends JWTPayload {
  sub: string;
  sid: string;
}

@Injectable()
export class JwtVerifierService {
  private readonly keySet: JWTVerifyGetKey;
  private readonly issuer: string;
  private readonly audience: string;

  constructor(config: ConfigService<Environment, true>) {
    this.keySet = createRemoteJWKSet(
      new URL(config.get("AUTH_JWKS_URL", { infer: true })),
    );
    this.issuer = config.get("AUTH_ISSUER", { infer: true });
    this.audience = config.get("AUTH_AUDIENCE", { infer: true });
  }

  async verify(token: string): Promise<AtlasJwtClaims> {
    const { payload } = await jwtVerify(token, this.keySet, {
      issuer: this.issuer,
      audience: this.audience,
    });

    if (typeof payload.sub !== "string" || typeof payload.sid !== "string") {
      throw new Error("Atlas JWT is missing its subject or session identifier.");
    }

    return payload as AtlasJwtClaims;
  }
}
