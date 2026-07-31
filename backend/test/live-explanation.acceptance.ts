import { ConfigService } from "@nestjs/config";
import {
  type Environment,
  validateEnvironment,
} from "../src/config/environment";
import type { ImpactEvidencePacket } from "../src/impact/evidence-packet.types";
import { IMPACT_EVIDENCE_PACKET_VERSION } from "../src/impact/evidence-packet.types";
import { ExplanationGroundingValidator } from "../src/impact/explanation-grounding.validator";
import { OpenAIExplanationClient } from "../src/impact/openai-explanation.client";

type Scenario = "planned" | "large-pr";

function packet(scenario: Scenario): ImpactEvidencePacket {
  const largePr = scenario === "large-pr";
  return {
    packetVersion: IMPACT_EVIDENCE_PACKET_VERSION,
    question: largePr
      ? "Assess a 125-file pull request that rotates the session contract while preserving API compatibility."
      : "Replace the Better Auth session boundary with compatible JWT verification.",
    analysisMode: largePr ? "pull-request" : "planned",
    analysisStatus: "complete",
    atlasAssessment: {
      answer:
        "Coordinate the session boundary with the observed API consumer.",
      executiveSummary:
        "Atlas resolved the session boundary and one statically observed consumer.",
      recommendations: [
        "Preserve the verified token contract during the migration.",
        "Resolve runtime consumers before rollout.",
      ],
      verificationPlan: [
        "Exercise the session boundary and observed API consumer.",
        "Confirm expired and revoked sessions remain rejected.",
      ],
    },
    repository: {
      id: "00000000-0000-4000-8000-000000000001",
      owner: "atlas-acceptance",
      name: "synthetic-auth",
    },
    sourceRevision: "acceptance-revision-1",
    risk: {
      level: largePr ? "high" : "medium",
      score: largePr ? 68 : 44,
      reasons: [
        "One indexed modification anchor resolved",
        "One observed downstream consumer found",
        "One runtime analysis gap requires verification",
      ],
    },
    directImpacts: [
      {
        id: "direct:session",
        classification: "direct",
        kind: "Symbol",
        title: "refreshSession · src/session.ts",
        detail: "The indexed session boundary is the modification anchor.",
        repositoryId: "00000000-0000-4000-8000-000000000001",
        repository: "atlas-acceptance/synthetic-auth",
        filePath: "src/session.ts",
        symbol: "refreshSession",
        hop: 0,
        confidence: 0.94,
        provenance: "indexed_source_chunk",
        evidenceIds: ["chunk:session"],
      },
    ],
    downstreamImpacts: [
      {
        id: "downstream:api",
        classification: "downstream",
        kind: "Consumer",
        title: "src/api.ts",
        detail: "The API module statically imports the session boundary.",
        repositoryId: "00000000-0000-4000-8000-000000000001",
        repository: "atlas-acceptance/synthetic-auth",
        filePath: "src/api.ts",
        hop: 1,
        confidence: 1,
        provenance: "typescript_static_import",
        evidenceIds: ["relationship:api-session"],
      },
    ],
    unknownImpacts: [
      {
        id: "unknown:runtime",
        classification: "unknown",
        kind: "Unknown",
        title: "Runtime consumers",
        detail: "Dynamic and external consumers are not represented.",
        repositoryId: "00000000-0000-4000-8000-000000000001",
        repository: "atlas-acceptance/synthetic-auth",
        hop: 1,
        confidence: 0,
        provenance: "analysis_gap",
        evidenceIds: [],
      },
    ],
    relationshipPaths: [
      {
        repository: "atlas-acceptance/synthetic-auth",
        filePath: "src/session.ts",
        hop: 0,
      },
      {
        repository: "atlas-acceptance/synthetic-auth",
        filePath: "src/api.ts",
        hop: 1,
      },
    ],
    evidence: [
      {
        id: "chunk:session",
        repositoryId: "00000000-0000-4000-8000-000000000001",
        repository: "atlas-acceptance/synthetic-auth",
        filePath: "src/session.ts",
        lineStart: 10,
        lineEnd: 18,
        symbol: "refreshSession",
        excerpt:
          "export function refreshSession(token: string) { return rotate(token); }",
        provenance: "indexed_source_chunk",
        sourceRevision: "acceptance-revision-1",
      },
      {
        id: "relationship:api-session",
        repositoryId: "00000000-0000-4000-8000-000000000001",
        repository: "atlas-acceptance/synthetic-auth",
        filePath: "src/api.ts",
        lineStart: 4,
        lineEnd: 4,
        excerpt:
          "src/api.ts imports ./session, resolving to src/session.ts.",
        provenance: "typescript_static_import",
        sourceRevision: "acceptance-revision-1",
      },
    ],
    limitations: [
      "Observed relationships come from statically resolved imports.",
      ...(largePr
        ? [
            "GitHub reported 125 changed files; Atlas retained only bounded evidence and patch context.",
            "New files remain unknown until the head revision is indexed.",
          ]
        : []),
    ],
  };
}

async function main() {
  const scenario = process.argv[2] as Scenario | undefined;
  if (scenario !== "planned" && scenario !== "large-pr") {
    throw new Error("Choose the planned or large-pr acceptance scenario.");
  }

  const environment = validateEnvironment(process.env);
  const config = new ConfigService<Environment>(
    environment,
  ) as unknown as ConfigService<Environment, true>;
  const client = new OpenAIExplanationClient(config);
  const validator = new ExplanationGroundingValidator(config);
  const evidence = packet(scenario);
  const generated = await client.generate(evidence);

  if (generated.status !== "completed") {
    console.log(
      JSON.stringify({
        scenario,
        provider: environment.LLM_PROVIDER,
        model: environment.LLM_EXPLANATION_MODEL,
        status: generated.status,
        failureCode:
          generated.status === "failed" ? generated.failureCode : null,
      }),
    );
    process.exitCode = 1;
    return;
  }

  const validation = validator.validate(generated.explanation, evidence);
  console.log(
    JSON.stringify({
      scenario,
      provider: generated.metadata.provider,
      model: generated.metadata.model,
      status: validation.status,
      failureCode:
        validation.status === "invalid" ? validation.failureCode : null,
      latencyMs: generated.metadata.latencyMs,
      usage: generated.metadata.usage,
    }),
  );
  if (validation.status === "invalid") process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      status: "runner_failed",
      errorType: error instanceof Error ? error.name : typeof error,
    }),
  );
  process.exitCode = 1;
});
