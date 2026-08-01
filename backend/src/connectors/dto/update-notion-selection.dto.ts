import { ArrayMaxSize, IsArray, IsUUID } from "class-validator";

export class UpdateNotionSelectionDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID("4", { each: true })
  resourceIds!: string[];
}
