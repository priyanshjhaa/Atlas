import { IsString, Length } from "class-validator";

export class CreateWorkspaceDto {
  @IsString()
  @Length(2, 80)
  name!: string;
}
