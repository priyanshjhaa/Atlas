import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthGuard } from "./auth.guard";
import { AuthRepository } from "./auth.repository";
import { JwtVerifierService } from "./jwt-verifier.service";
import { MeController } from "./me.controller";
import { WorkspaceRoleGuard } from "./workspace-role.guard";

@Module({
  controllers: [MeController],
  providers: [
    AuthRepository,
    JwtVerifierService,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: WorkspaceRoleGuard,
    },
  ],
  exports: [AuthRepository],
})
export class AuthModule {}
