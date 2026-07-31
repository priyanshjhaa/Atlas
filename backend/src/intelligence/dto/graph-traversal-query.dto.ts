import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from "class-validator";

function queryBoolean(value: unknown): unknown {
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return value;
}

export class GraphTraversalQueryDto {
  @IsOptional()
  @IsUUID()
  entityId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  depth = 2;

  @IsOptional()
  @IsIn(["incoming", "outgoing", "both"])
  direction: "incoming" | "outgoing" | "both" = "both";

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => queryBoolean(value))
  @IsBoolean()
  includeHistorical = false;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => queryBoolean(value))
  @IsBoolean()
  includeInferred = true;
}
