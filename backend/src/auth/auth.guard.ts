import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthRepository } from "./auth.repository";
import { IS_PUBLIC_KEY } from "./auth.decorators";
import type { AtlasRequest } from "./auth.types";
import { JwtVerifierService } from "./jwt-verifier.service";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtVerifier: JwtVerifierService,
    private readonly authRepository: AuthRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AtlasRequest>();
    const authorization = request.headers.authorization;
    const header = Array.isArray(authorization)
      ? authorization[0]
      : authorization;
    const token = header?.match(/^Bearer\s+(.+)$/i)?.[1];

    if (!token) {
      throw new UnauthorizedException("A Better Auth access token is required.");
    }

    try {
      const claims = await this.jwtVerifier.verify(token);
      const identity = await this.authRepository.findActiveSession(
        claims.sid,
        claims.sub,
      );

      if (!identity) {
        throw new UnauthorizedException("The session is expired or revoked.");
      }

      request.auth = identity;
      return true;
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException("The access token is invalid.");
    }
  }
}
