import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsInt,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";
import type { ImpactInputMode, ImpactScope } from "../impact.types";

export class CreateImpactReportDto {
  @IsIn(["planned", "pull-request"])
  mode!: ImpactInputMode;

  @IsUUID("4")
  repositoryId!: string;

  @ValidateIf((value: CreateImpactReportDto) => value.mode === "planned")
  @IsString()
  @Length(10, 4_000)
  description?: string;

  @ValidateIf((value: CreateImpactReportDto) => value.mode === "pull-request")
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  pullRequestNumber?: number;

  @IsIn(["repository", "workspace"])
  scope!: ImpactScope;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  anchors?: string[];
}
