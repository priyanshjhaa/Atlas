import { IsString, MaxLength, MinLength } from "class-validator";

export class AskNotionQuestionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  query!: string;
}
