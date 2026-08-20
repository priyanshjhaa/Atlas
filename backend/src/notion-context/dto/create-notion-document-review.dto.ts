import { IsUUID } from "class-validator";

export class CreateNotionDocumentReviewDto {
  @IsUUID()
  documentId!: string;

  @IsUUID()
  previousVersionId!: string;
}
