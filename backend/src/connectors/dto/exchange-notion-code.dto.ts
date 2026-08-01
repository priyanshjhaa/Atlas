import { IsString, MinLength } from "class-validator";

export class ExchangeNotionCodeDto {
  @IsString()
  @MinLength(8)
  code!: string;
}
