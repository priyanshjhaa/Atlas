import { IsString, Matches } from "class-validator";

export class InstallGitHubConnectorDto {
  @IsString()
  @Matches(/^\d+$/)
  installationId!: string;
}
