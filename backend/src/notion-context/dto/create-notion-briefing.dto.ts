import { IsISO8601 } from "class-validator";

export class CreateNotionBriefingDto {
  @IsISO8601({ strict: true })
  snapshotFrom!: string;

  @IsISO8601({ strict: true })
  snapshotThrough!: string;
}
