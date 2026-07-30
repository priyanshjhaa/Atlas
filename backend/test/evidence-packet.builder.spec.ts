import { describe, expect, it } from "vitest";
import { EvidencePacketBuilder } from "../src/impact/evidence-packet.builder";
import type {
  ImpactReportInput,
  ImpactReportResult,
} from "../src/impact/impact.types";

const repositoryId = "01951ca1-2c72-7000-8000-000000000002";

function fixture(): {
  input: ImpactReportInput;
  result: ImpactReportResult;
} {
  return {
    input: {
      mode: "planned",
      repositoryId,
      description:
        'Rotate sessions with api_key="super secret value" and preserve callers.',
      scope: "repository",
      anchors: ["refreshSession"],
    },
    result: {
      status: "complete",
      title: "Session rotation",
      answer: "Update the session boundary.",
      executiveSummary: "One direct and one downstream impact.",
      risk: {
        level: "medium",
        score: 55,
        reasons: ["One observed downstream consumer."],
      },
      repository: {
        id: repositoryId,
        owner: "atlas",
        name: "identity",
        defaultBranch: "main",
      },
      sourceRevision: "revision-1",
      scope: "repository",
      resolvedEntities: [
        {
          id: "symbol-refresh",
          kind: "symbol",
          name: "refreshSession",
          filePath: "src/session.ts",
          confidence: 0.9,
        },
      ],
      directImpacts: [
        {
          id: "direct:symbol-refresh",
          classification: "direct",
          kind: "Symbol",
          title: "refreshSession",
          detail: "The resolved session boundary.",
          repositoryId,
          repository: "atlas/identity",
          filePath: "src/session.ts",
          symbol: "refreshSession",
          hop: 0,
          confidence: 0.9,
          provenance: "indexed_source_chunk",
          evidenceIds: [
            "chunk:direct",
            "chunk:duplicate-location",
            "chunk:other-repository",
            "chunk:other-revision",
          ],
        },
      ],
      downstreamImpacts: [
        {
          id: "downstream:consumer",
          classification: "downstream",
          kind: "Consumer",
          title: "src/api.ts",
          detail: "Imports the resolved session boundary.",
          repositoryId,
          repository: "atlas/identity",
          filePath: "src/api.ts",
          hop: 1,
          confidence: 1,
          provenance: "typescript_static_import",
          evidenceIds: ["relationship:consumer"],
        },
      ],
      unknownImpacts: [
        {
          id: "unknown:runtime",
          classification: "unknown",
          kind: "Unknown",
          title: "Runtime consumers",
          detail: "Dynamic consumers are not represented.",
          repositoryId,
          repository: "atlas/identity",
          hop: 0,
          confidence: 0,
          provenance: "analysis_gap",
          evidenceIds: [],
        },
      ],
      evidence: [
        {
          id: "relationship:consumer",
          repositoryId,
          repository: "atlas/identity",
          filePath: "src/api.ts",
          excerpt: "Bearer abcdefghijklmnopqrstuvwxyz",
          provenance: "typescript_static_import",
          sourceRevision: "revision-1",
        },
        {
          id: "chunk:direct",
          repositoryId,
          repository: "atlas/identity",
          filePath: "src/session.ts",
          lineStart: 10,
          lineEnd: 14,
          symbol: "refreshSession",
          excerpt: "export function refreshSession() { return 'safe'; }",
          provenance: "indexed_source_chunk",
          sourceRevision: "revision-1",
        },
        {
          id: "chunk:duplicate-location",
          repositoryId,
          repository: "atlas/identity",
          filePath: "src/session.ts",
          lineStart: 10,
          lineEnd: 14,
          symbol: "refreshSession",
          excerpt: "duplicate location",
          provenance: "indexed_source_chunk",
          sourceRevision: "revision-1",
        },
        {
          id: "chunk:other-repository",
          repositoryId: "other-repository",
          repository: "other/private",
          filePath: "secrets.ts",
          excerpt: "password=must-not-enter-packet",
          provenance: "indexed_source_chunk",
          sourceRevision: "revision-1",
        },
        {
          id: "chunk:other-revision",
          repositoryId,
          repository: "atlas/identity",
          filePath: "old.ts",
          excerpt: "Old source.",
          provenance: "indexed_source_chunk",
          sourceRevision: "revision-0",
        },
      ],
      relationshipPath: [
        { repository: "identity", filePath: "src/session.ts", hop: 0 },
        { repository: "atlas/identity", filePath: "src/api.ts", hop: 1 },
        { repository: "atlas/identity", filePath: "src/api.ts", hop: 1 },
        { repository: "other/private", filePath: "secrets.ts", hop: 1 },
      ],
      recommendations: [],
      verificationPlan: [],
      limitations: ["Static relationships only."],
      generatedAt: "2026-07-29T00:00:00.000Z",
    },
  };
}

describe("EvidencePacketBuilder", () => {
  it("builds the same bounded packet and hash for the same report", () => {
    const builder = new EvidencePacketBuilder();
    const { input, result } = fixture();

    const first = builder.build(input, result, {
      maxEvidenceItems: 2,
      maxEvidenceCharacters: 80,
      maxExcerptCharacters: 48,
    });
    const second = builder.build(input, result, {
      maxEvidenceItems: 2,
      maxEvidenceCharacters: 80,
      maxExcerptCharacters: 48,
    });

    expect(first).toEqual(second);
    expect(first.status).toBe("ready");
    if (first.status !== "ready") return;
    expect(first.evidencePacketHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.packet.evidence).toHaveLength(2);
    expect(
      first.packet.evidence.reduce(
        (total, item) => total + item.excerpt.length,
        0,
      ),
    ).toBeLessThanOrEqual(80);
    expect(first.packet.evidence[0]?.id).toBe("chunk:direct");
    expect(first.packet.relationshipPaths).toHaveLength(2);
    expect(first.packet.packetVersion).toBe("2");
    expect(first.packet.atlasAssessment).toEqual({
      answer: "Update the session boundary.",
      executiveSummary: "One direct and one downstream impact.",
      recommendations: [],
      verificationPlan: [],
    });
  });

  it("deduplicates locations and excludes unauthorized or stale citations", () => {
    const output = new EvidencePacketBuilder().build(
      fixture().input,
      fixture().result,
    );

    expect(output.status).toBe("ready");
    if (output.status !== "ready") return;
    expect(output.packet.evidence.map((item) => item.id)).toEqual([
      "chunk:direct",
      "relationship:consumer",
    ]);
    expect(JSON.stringify(output.packet)).not.toContain("other/private");
    expect(JSON.stringify(output.packet)).not.toContain("secrets.ts");
    expect(JSON.stringify(output.packet)).not.toContain("Old source");
  });

  it("bounds the complete serialized packet, not only evidence excerpts", () => {
    const { input, result } = fixture();
    const repeatedDownstream = Array.from({ length: 40 }, (_, index) => ({
      ...result.downstreamImpacts[0],
      id: `downstream:${index}`,
      filePath: `src/consumer-${index}.ts`,
      title: `Consumer ${index} ${"x".repeat(300)}`,
      detail: `Detailed impact ${index} ${"y".repeat(1_000)}`,
    }));

    const output = new EvidencePacketBuilder().build(
      input,
      {
        ...result,
        downstreamImpacts: repeatedDownstream,
      },
      {
        maxEvidenceItems: 8,
        maxEvidenceCharacters: 6_000,
        maxPacketCharacters: 8_000,
      },
    );

    expect(output.status).toBe("ready");
    if (output.status !== "ready") return;
    expect(JSON.stringify(output.packet).length).toBeLessThanOrEqual(8_000);
    expect(output.packet.downstreamImpacts.length).toBeLessThan(40);
    expect(output.packet.evidence.length).toBeGreaterThan(0);
  });

  it("redacts credentials from the question and evidence", () => {
    const { input, result } = fixture();
    const output = new EvidencePacketBuilder().build(input, {
      ...result,
      answer: "Rotate api_key=assessment-secret.",
      recommendations: ["Send Bearer assessment-token-value-now."],
    });

    expect(output.status).toBe("ready");
    if (output.status !== "ready") return;
    const serialized = JSON.stringify(output.packet);
    expect(serialized).not.toContain("super secret value");
    expect(serialized).not.toContain("abcdefghijklmnopqrstuvwxyz");
    expect(serialized).not.toContain("assessment-secret");
    expect(serialized).not.toContain("assessment-token-value-now");
    expect(serialized).toContain("[REDACTED]");
  });

  it("preserves the bounded Atlas assessment before lower-priority evidence", () => {
    const { input, result } = fixture();
    const output = new EvidencePacketBuilder().build(
      input,
      {
        ...result,
        answer: `Assessment ${"a".repeat(2_000)}`,
        executiveSummary: `Summary ${"b".repeat(2_000)}`,
        recommendations: Array.from(
          { length: 10 },
          (_, index) => `Recommendation ${index} ${"r".repeat(700)}`,
        ),
        verificationPlan: Array.from(
          { length: 10 },
          (_, index) => `Verification ${index} ${"v".repeat(700)}`,
        ),
      },
      {
        maxEvidenceItems: 8,
        maxEvidenceCharacters: 6_000,
        maxPacketCharacters: 4_000,
      },
    );

    expect(output.status).toBe("ready");
    if (output.status !== "ready") return;
    expect(JSON.stringify(output.packet).length).toBeLessThanOrEqual(4_000);
    expect(output.packet.atlasAssessment.answer.length).toBeGreaterThanOrEqual(
      160,
    );
    expect(
      output.packet.atlasAssessment.executiveSummary.length,
    ).toBeGreaterThanOrEqual(240);
    expect(output.packet.atlasAssessment.recommendations.length).toBeGreaterThan(
      0,
    );
    expect(
      output.packet.atlasAssessment.verificationPlan.length,
    ).toBeGreaterThan(0);
    expect(
      new Set(output.packet.evidence.map((item) => item.provenance)),
    ).toEqual(
      new Set(["indexed_source_chunk", "typescript_static_import"]),
    );
    expect(output.packet.downstreamImpacts.length).toBeLessThanOrEqual(
      result.downstreamImpacts.length,
    );
  });

  it("does not copy changed-file patches into the packet", () => {
    const { input, result } = fixture();
    const pullRequestInput: ImpactReportInput = {
      ...input,
      mode: "pull-request",
      pullRequest: {
        number: 12,
        title: "Rotate sessions",
        url: "https://github.com/atlas/identity/pull/12",
        author: "atlas-dev",
        baseRevision: "revision-1",
        headRevision: "revision-2",
        analysisBudget: {
          totalChangedFiles: 1,
          filesRetrieved: 1,
          filesWithPatchContext: 1,
          patchCharactersAnalyzed: 24,
          githubFileLimitReached: false,
        },
        changedFiles: [
          {
            path: "src/session.ts",
            status: "modified",
            additions: 1,
            deletions: 1,
            patch: "UNBOUNDED_PATCH_SENTINEL",
          },
        ],
      },
    };
    const output = new EvidencePacketBuilder().build(pullRequestInput, result);

    expect(output.status).toBe("ready");
    if (output.status !== "ready") return;
    expect(JSON.stringify(output.packet)).not.toContain(
      "UNBOUNDED_PATCH_SENTINEL",
    );
    expect(output.packet.analysisMode).toBe("pull-request");
  });

  it("short-circuits reports without resolved or citable evidence", () => {
    const { input, result } = fixture();

    expect(
      new EvidencePacketBuilder().build(input, {
        ...result,
        status: "insufficient_evidence",
        resolvedEntities: [],
        directImpacts: [],
      }),
    ).toEqual({
      status: "insufficient_evidence",
      reason: "no_resolved_evidence",
    });

    expect(
      new EvidencePacketBuilder().build(input, {
        ...result,
        evidence: [],
      }),
    ).toEqual({
      status: "insufficient_evidence",
      reason: "no_citable_evidence",
    });
  });
});
