import { IsISO8601 } from "class-validator";

export class AcknowledgeNotionContextDto {
  @IsISO8601({ strict: true })
  acknowledgedThrough!: string;
}
