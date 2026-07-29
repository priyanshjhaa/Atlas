import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  IMPACT_EVIDENCE_PACKET_VERSION,
  type ImpactEvidencePacket,
  type ImpactEvidencePacketBuildResult,
  type ImpactEvidencePacketCitation,
  type ImpactEvidencePacketFinding,
  type ImpactEvidencePacketLimits,
} from "./evidence-packet.types";
import type {
  ImpactCitation,
  ImpactFinding,
  ImpactReportInput,
  ImpactReportResult,
} from "./impact.types";

export const DEFAULT_IMPACT_EVIDENCE_PACKET_LIMITS: ImpactEvidencePacketLimits =
  Object.freeze({
    maxEvidenceItems: 30,
    maxEvidenceCharacters: 60_000,
    maxExcerptCharacters: 4_000,
    maxQuestionCharacters: 12_000,
  });

const REDACTED = "[REDACTED]";
const PRIVATE_KEY_PATTERN =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi;
const CREDENTIAL_URL_PATTERN =
  /\b([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^/\s@]+@/gi;
const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const NAMED_SECRET_PATTERN =
  /\b([A-Za-z0-9_-]*(?:api[_-]?key|token|secret|password|private[_-]?key)[A-Za-z0-9_-]*)(\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}\]]+)/gi;
const KNOWN_TOKEN_PATTERN =
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,})\b/g;

interface RankedCitation {
  citation: ImpactCitation;
  rank: number;
}

@Injectable()
export class EvidencePacketBuilder {
  build(
    input: ImpactReportInput,
    result: ImpactReportResult,
    requestedLimits: Partial<ImpactEvidencePacketLimits> = {},
  ): ImpactEvidencePacketBuildResult {
    if (input.repositoryId !== result.repository.id) {
      return {
        status: "insufficient_evidence",
        reason: "repository_mismatch",
      };
    }
    if (
      result.status === "insufficient_evidence" ||
      result.resolvedEntities.length === 0 ||
      result.directImpacts.length === 0
    ) {
      return {
        status: "insufficient_evidence",
        reason: "no_resolved_evidence",
      };
    }

    const limits = this.normalizeLimits(requestedLimits);
    const evidence = this.selectEvidence(result, limits);
    if (evidence.length === 0) {
      return {
        status: "insufficient_evidence",
        reason: "no_citable_evidence",
      };
    }

    const selectedEvidenceIds = new Set(evidence.map((item) => item.id));
    const canonicalRepository = `${result.repository.owner}/${result.repository.name}`;
    const packet: ImpactEvidencePacket = {
      packetVersion: IMPACT_EVIDENCE_PACKET_VERSION,
      question: this.sanitize(input.description).slice(
        0,
        limits.maxQuestionCharacters,
      ),
      analysisMode: input.mode,
      analysisStatus: result.status,
      repository: {
        id: result.repository.id,
        owner: result.repository.owner,
        name: result.repository.name,
      },
      sourceRevision: result.sourceRevision,
      risk: {
        level: result.risk.level,
        score: result.risk.score,
        reasons: result.risk.reasons.map((reason) => this.sanitize(reason)),
      },
      directImpacts: this.prepareFindings(
        result.directImpacts,
        selectedEvidenceIds,
        result.repository.id,
        canonicalRepository,
      ),
      downstreamImpacts: this.prepareFindings(
        result.downstreamImpacts,
        selectedEvidenceIds,
        result.repository.id,
        canonicalRepository,
      ),
      unknownImpacts: this.prepareFindings(
        result.unknownImpacts,
        selectedEvidenceIds,
        result.repository.id,
        canonicalRepository,
      ),
      relationshipPaths: this.relationshipPaths(result, canonicalRepository),
      evidence: evidence.map((item) => ({
        ...item,
        repository: canonicalRepository,
      })),
      limitations: result.limitations.map((item) => this.sanitize(item)),
    };

    return {
      status: "ready",
      packet,
      evidencePacketHash: createHash("sha256")
        .update(this.canonicalJson(packet))
        .digest("hex"),
    };
  }

  private normalizeLimits(
    requested: Partial<ImpactEvidencePacketLimits>,
  ): ImpactEvidencePacketLimits {
    const positiveInteger = (value: number | undefined, fallback: number) =>
      typeof value === "number" && Number.isInteger(value) && value > 0
        ? value
        : fallback;

    return {
      maxEvidenceItems: positiveInteger(
        requested.maxEvidenceItems,
        DEFAULT_IMPACT_EVIDENCE_PACKET_LIMITS.maxEvidenceItems,
      ),
      maxEvidenceCharacters: positiveInteger(
        requested.maxEvidenceCharacters,
        DEFAULT_IMPACT_EVIDENCE_PACKET_LIMITS.maxEvidenceCharacters,
      ),
      maxExcerptCharacters: positiveInteger(
        requested.maxExcerptCharacters,
        DEFAULT_IMPACT_EVIDENCE_PACKET_LIMITS.maxExcerptCharacters,
      ),
      maxQuestionCharacters: positiveInteger(
        requested.maxQuestionCharacters,
        DEFAULT_IMPACT_EVIDENCE_PACKET_LIMITS.maxQuestionCharacters,
      ),
    };
  }

  private selectEvidence(
    result: ImpactReportResult,
    limits: ImpactEvidencePacketLimits,
  ): ImpactEvidencePacketCitation[] {
    const ranks = new Map<string, number>();
    const rankFindings = (findings: ImpactFinding[], baseRank: number) => {
      findings.forEach((finding) => {
        finding.evidenceIds.forEach((id) => {
          const rank = baseRank + finding.hop;
          ranks.set(id, Math.min(ranks.get(id) ?? rank, rank));
        });
      });
    };
    rankFindings(result.directImpacts, 0);
    rankFindings(result.downstreamImpacts, 100);

    const ranked: RankedCitation[] = result.evidence
      .filter(
        (citation) =>
          citation.repositoryId === result.repository.id &&
          citation.sourceRevision === result.sourceRevision &&
          ranks.has(citation.id),
      )
      .map((citation) => ({
        citation,
        rank: ranks.get(citation.id) ?? Number.MAX_SAFE_INTEGER,
      }))
      .sort(
        (left, right) =>
          left.rank - right.rank ||
          left.citation.filePath.localeCompare(right.citation.filePath) ||
          left.citation.id.localeCompare(right.citation.id),
      );

    const selected: ImpactEvidencePacketCitation[] = [];
    const seenIds = new Set<string>();
    const seenLocations = new Set<string>();
    let characterCount = 0;

    for (const { citation } of ranked) {
      const locationKey = [
        citation.provenance,
        citation.repositoryId,
        citation.filePath,
        citation.lineStart ?? "",
        citation.lineEnd ?? "",
        citation.symbol ?? "",
      ].join(":");
      if (seenIds.has(citation.id) || seenLocations.has(locationKey)) continue;

      const sanitizedExcerpt = this.sanitize(citation.excerpt);
      const remainingCharacters =
        limits.maxEvidenceCharacters - characterCount;
      const excerpt = sanitizedExcerpt.slice(
        0,
        Math.min(limits.maxExcerptCharacters, remainingCharacters),
      );
      if (!excerpt) break;

      selected.push({
        id: citation.id,
        repositoryId: citation.repositoryId,
        repository: citation.repository,
        filePath: citation.filePath,
        lineStart: citation.lineStart,
        lineEnd: citation.lineEnd,
        symbol: citation.symbol,
        excerpt,
        provenance: citation.provenance,
        sourceRevision: citation.sourceRevision,
      });
      seenIds.add(citation.id);
      seenLocations.add(locationKey);
      characterCount += excerpt.length;
      if (
        selected.length >= limits.maxEvidenceItems ||
        characterCount >= limits.maxEvidenceCharacters
      ) {
        break;
      }
    }

    return selected;
  }

  private prepareFindings(
    findings: ImpactFinding[],
    selectedEvidenceIds: Set<string>,
    repositoryId: string,
    canonicalRepository: string,
  ): ImpactEvidencePacketFinding[] {
    const unique = new Map<string, ImpactFinding>();
    for (const finding of findings
      .filter((item) => item.repositoryId === repositoryId)
      .sort((left, right) =>
        this.findingSortKey(left).localeCompare(this.findingSortKey(right)),
      )) {
      const key =
        finding.classification === "unknown"
          ? finding.id
          : [
              finding.classification,
              finding.repositoryId,
              finding.filePath ?? "",
              finding.symbol ?? "",
              finding.hop,
            ].join(":");
      if (!unique.has(key)) unique.set(key, finding);
    }

    return [...unique.values()].map((finding) => ({
      id: finding.id,
      classification: finding.classification,
      kind: finding.kind,
      title: this.sanitize(finding.title),
      detail: this.sanitize(finding.detail),
      repositoryId: finding.repositoryId,
      repository: canonicalRepository,
      filePath: finding.filePath,
      symbol: finding.symbol,
      hop: finding.hop,
      confidence: finding.confidence,
      provenance: finding.provenance,
      evidenceIds: [
        ...new Set(
          finding.evidenceIds.filter((id) => selectedEvidenceIds.has(id)),
        ),
      ].sort(),
    }));
  }

  private relationshipPaths(
    result: ImpactReportResult,
    canonicalRepository: string,
  ): ImpactEvidencePacket["relationshipPaths"] {
    const unique = new Map<
      string,
      ImpactEvidencePacket["relationshipPaths"][number]
    >();
    for (const path of result.relationshipPath.filter(
      (item) => item.repository === canonicalRepository,
    )) {
      const sanitized = {
        repository: canonicalRepository,
        filePath: this.sanitize(path.filePath),
        hop: path.hop,
      };
      const key = `${sanitized.repository}:${sanitized.filePath}:${sanitized.hop}`;
      if (!unique.has(key)) unique.set(key, sanitized);
    }
    return [...unique.values()].sort(
      (left, right) =>
        left.hop - right.hop ||
        left.repository.localeCompare(right.repository) ||
        left.filePath.localeCompare(right.filePath),
    );
  }

  private findingSortKey(finding: ImpactFinding): string {
    return [
      String(finding.hop).padStart(4, "0"),
      finding.repository,
      finding.filePath ?? "",
      finding.symbol ?? "",
      finding.id,
    ].join(":");
  }

  private sanitize(value: string): string {
    return value
      .replace(PRIVATE_KEY_PATTERN, REDACTED)
      .replace(CREDENTIAL_URL_PATTERN, `$1${REDACTED}@`)
      .replace(BEARER_TOKEN_PATTERN, `Bearer ${REDACTED}`)
      .replace(
        NAMED_SECRET_PATTERN,
        (_match, name: string, separator: string) =>
          `${name}${separator}${REDACTED}`,
      )
      .replace(KNOWN_TOKEN_PATTERN, REDACTED);
  }

  private canonicalJson(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.canonicalJson(item)).join(",")}]`;
    }
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      return `{${Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort()
        .map(
          (key) =>
            `${JSON.stringify(key)}:${this.canonicalJson(record[key])}`,
        )
        .join(",")}}`;
    }
    return JSON.stringify(value);
  }
}
