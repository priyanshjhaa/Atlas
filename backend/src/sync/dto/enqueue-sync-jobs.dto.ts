import { ArrayMaxSize, IsArray, IsOptional, IsUUID } from "class-validator";

export class EnqueueSyncJobsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID("4", { each: true })
  repositoryIds?: string[];
}
