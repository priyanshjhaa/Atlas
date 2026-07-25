import { IsString, Length } from "class-validator";

export class UpdateWorkspaceDto {
  @IsString()
  @Length(2, 80)
  name!: string;
}
