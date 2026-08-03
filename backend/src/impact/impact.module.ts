import { Module } from "@nestjs/common";
import { ConnectorsModule } from "../connectors/connectors.module";
import { IntelligenceModule } from "../intelligence/intelligence.module";
import { EvidencePacketBuilder } from "./evidence-packet.builder";
import { ExplanationGenerationService } from "./explanation-generation.service";
import { ExplanationGroundingValidator } from "./explanation-grounding.validator";
import { ExplanationObservabilityService } from "./explanation-observability.service";
import { ImpactAnalysisService } from "./impact-analysis.service";
import { ImpactRepository } from "./impact.repository";
import { ImpactReportsController } from "./impact-reports.controller";
import { ImpactReportsService } from "./impact-reports.service";
import { OpenAIExplanationClient } from "./openai-explanation.client";
import { PullRequestResolverService } from "./pull-request-resolver.service";

@Module({
  imports: [ConnectorsModule, IntelligenceModule],
  controllers: [ImpactReportsController],
  providers: [
    EvidencePacketBuilder,
    ExplanationGenerationService,
    ExplanationGroundingValidator,
    ExplanationObservabilityService,
    ImpactAnalysisService,
    ImpactRepository,
    ImpactReportsService,
    OpenAIExplanationClient,
    PullRequestResolverService,
  ],
  exports: [ExplanationObservabilityService],
})
export class ImpactModule {}
