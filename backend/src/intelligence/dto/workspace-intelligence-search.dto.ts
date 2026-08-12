import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";
import type { WorkspaceSearchProvider } from "../retrieval.service";

export class WorkspaceIntelligenceSearchDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  query!: string;

  @IsOptional()
  @IsUUID()
  repositoryId?: string;

  @IsOptional()
  @IsArray()
  @IsIn(["github", "notion"], { each: true })
  providers?: WorkspaceSearchProvider[];
}
