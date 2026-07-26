import { Module } from "@nestjs/common";
import { GitHubAppService } from "../connectors/github-app.service";
import { ArchitectureBuilderService } from "./architecture-builder.service";
import { EmbeddingsService } from "./embeddings.service";
import { IngestionService } from "./ingestion.service";
import { IntelligenceController } from "./intelligence.controller";
import { IntelligenceRepository } from "./intelligence.repository";
import { IntelligenceService } from "./intelligence.service";
import { ParserService } from "./parser.service";
import { RelationshipExtractorService } from "./relationship-extractor.service";
import { RetrievalService } from "./retrieval.service";
import { SourceDiscoveryService } from "./source-discovery.service";

@Module({
  controllers: [IntelligenceController],
  providers: [
    ArchitectureBuilderService,
    EmbeddingsService,
    GitHubAppService,
    IngestionService,
    IntelligenceRepository,
    IntelligenceService,
    ParserService,
    RelationshipExtractorService,
    RetrievalService,
    SourceDiscoveryService,
  ],
  exports: [IngestionService],
})
export class IntelligenceModule {}
