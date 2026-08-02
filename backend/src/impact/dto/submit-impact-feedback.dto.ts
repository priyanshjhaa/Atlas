import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from "class-validator";

export class SubmitImpactFeedbackDto {
  @IsIn(["useful", "not_useful"])
  rating!: "useful" | "not_useful";

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @Length(1, 240, { each: true })
  confirmedFindingIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  missedImpact?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  comment?: string;
}
