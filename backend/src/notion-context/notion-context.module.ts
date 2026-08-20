import { Module } from "@nestjs/common";
import { IntelligenceModule } from "../intelligence/intelligence.module";
import { NotionContextController } from "./notion-context.controller";
import { NotionContextRepository } from "./notion-context.repository";
import { NotionContextService } from "./notion-context.service";
import { NOTION_CONTEXT_GENERATION_CLIENT } from "./notion-context.types";
import { OpenAINotionContextClient } from "./openai-notion-context.client";

@Module({
  imports: [IntelligenceModule],
  controllers: [NotionContextController],
  providers: [
    NotionContextRepository,
    NotionContextService,
    OpenAINotionContextClient,
    {
      provide: NOTION_CONTEXT_GENERATION_CLIENT,
      useExisting: OpenAINotionContextClient,
    },
  ],
  exports: [NotionContextService],
})
export class NotionContextModule {}
