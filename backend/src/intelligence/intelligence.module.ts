import { Module } from "@nestjs/common";
import { GitHubAppService } from "../connectors/github-app.service";
import { ArchitectureBuilderService } from "./architecture-builder.service";
import { ApiSymbolLinkerService } from "./api-symbol-linker.service";
import { EmbeddingsService } from "./embeddings.service";
import { GraphProjectionBuilder } from "./graph-projection.builder";
import { GraphTraversalService } from "./graph-traversal.service";
import { IngestionService } from "./ingestion.service";
import { IntelligenceController } from "./intelligence.controller";
import { IntelligenceRepository } from "./intelligence.repository";
import { IntelligenceService } from "./intelligence.service";
import { ParserService } from "./parser.service";
import { PackageLinkerService } from "./package-linker.service";
import { RelationshipExtractorService } from "./relationship-extractor.service";
import { RelationshipObservationBuilder } from "./relationship-observation.builder";
import { RetrievalService } from "./retrieval.service";
import { SourceDiscoveryService } from "./source-discovery.service";
import { TypeCheckerService } from "./type-checker.service";
import { WorkspaceAnalyzerService } from "./workspace-analyzer.service";
import { WorkspaceIntelligenceController } from "./workspace-intelligence.controller";

@Module({
  controllers: [IntelligenceController, WorkspaceIntelligenceController],
  providers: [
    ArchitectureBuilderService,
    ApiSymbolLinkerService,
    EmbeddingsService,
    GraphProjectionBuilder,
    GraphTraversalService,
    GitHubAppService,
    IngestionService,
    IntelligenceRepository,
    IntelligenceService,
    ParserService,
    PackageLinkerService,
    RelationshipExtractorService,
    RelationshipObservationBuilder,
    RetrievalService,
    SourceDiscoveryService,
    TypeCheckerService,
    WorkspaceAnalyzerService,
  ],
  exports: [EmbeddingsService, IngestionService, RetrievalService],
})
export class IntelligenceModule {}
