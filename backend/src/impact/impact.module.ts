import { Module } from "@nestjs/common";
import { ConnectorsModule } from "../connectors/connectors.module";
import { IntelligenceModule } from "../intelligence/intelligence.module";
import { EvidencePacketBuilder } from "./evidence-packet.builder";
import { ImpactAnalysisService } from "./impact-analysis.service";
import { ImpactRepository } from "./impact.repository";
import { ImpactReportsController } from "./impact-reports.controller";
import { ImpactReportsService } from "./impact-reports.service";
import { PullRequestResolverService } from "./pull-request-resolver.service";

@Module({
  imports: [ConnectorsModule, IntelligenceModule],
  controllers: [ImpactReportsController],
  providers: [
    EvidencePacketBuilder,
    ImpactAnalysisService,
    ImpactRepository,
    ImpactReportsService,
    PullRequestResolverService,
  ],
})
export class ImpactModule {}
