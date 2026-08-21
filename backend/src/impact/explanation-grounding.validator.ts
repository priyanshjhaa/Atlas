import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Environment } from "../config/environment";
import type {
  ImpactEvidencePacket,
  ImpactEvidencePacketCitation,
  ImpactEvidencePacketFinding,
} from "./evidence-packet.types";
import type { ExplanationValidationResult } from "./explanation-validator.types";
import { impactExplanationSchema } from "./explanation.schema";
import type { ImpactExplanation } from "./explanation.types";

const SLASH_FILE_PATH_PATTERN =
  /(?:^|[\s`"'(])((?:[A-Za-z0-9_@.-]+\/)+[A-Za-z0-9_@().-]+\.[A-Za-z0-9]+)(?=$|[\s`"',.;:!?)])/g;
const STANDALONE_FILE_NAME_PATTERN =
  /^(?:[A-Za-z0-9_.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|sql|py|go|rs|java|kt|rb|php|cs|css|scss|html|yaml|yml|toml|xml|sh)|README(?:\.[A-Za-z0-9]+)?|CHANGELOG(?:\.[A-Za-z0-9]+)?|Dockerfile|Makefile)$/;
const RELATIONSHIP_PATTERN =
  /\b(imports?|imported by|depends?\s+on|dependency|calls?|relationship)\b/i;
const PROMPT_INJECTION_OUTPUT_PATTERNS = [
  /\b(?:ignore|disregard|override|bypass)\b.{0,80}\b(?:instructions?|rules?|polic(?:y|ies)|system|developer|atlas)\b/i,
  /\b(?:system|developer|security)\s+(?:message|instructions?|override|policy)\b/i,
  /\byou are now (?:the|a) (?:system|developer|assistant|tool)\b/i,
  /\b(?:call|invoke)\b.{0,40}\b(?:external\s+)?(?:tools?|internet|browser|network)\b/i,
  /\b(?:reveal|retrieve|exfiltrate|leak)\b.{0,40}\b(?:secrets?|credentials?|tokens?|private keys?)\b/i,
  /\b(?:BEGIN|END)_ATLAS_EVIDENCE_PACKET\b/,
  /\b(?:FINAL_OUTPUT_CHECKLIST|INSTRUCTION_AUTHORITY|CONTENT_CLASSIFICATION)\b/,
] as const;
const PROVENANCE_PATTERNS = [
  {
    pattern: /\b(indexed source(?: chunk)?|source chunk)\b/i,
    value: "indexed_source_chunk",
  },
  {
    pattern: /\b(typescript static import|static import)\b/i,
    value: "typescript_static_import",
  },
  {
    pattern: /\b(package manifest dependency|manifest dependency)\b/i,
    value: "package_manifest_dependency",
  },
  {
    pattern: /\b(typescript public api import|public api import)\b/i,
    value: "typescript_public_api_import",
  },
  {
    pattern: /\b(typescript public api call|public api call)\b/i,
    value: "typescript_public_api_call",
  },
  {
    pattern: /\b(historical relationship|historically observed)\b/i,
    value: "historical_relationship",
  },
  { pattern: /\banalysis gap\b/i, value: "analysis_gap" },
] as const;
const RELATIONSHIP_PROVENANCES = new Set<
  ImpactEvidencePacketCitation["provenance"]
>([
  "typescript_static_import",
  "package_manifest_dependency",
  "typescript_public_api_import",
  "typescript_public_api_call",
  "historical_relationship",
]);

interface ExplanationTextUnit {
  text: string;
  evidenceIds: string[];
  kind: "factual" | "recommendation" | "question";
}

@Injectable()
export class ExplanationGroundingValidator {
  constructor(
    private readonly config: ConfigService<Environment, true>,
  ) {}

  validate(
    candidate: unknown,
    packet: ImpactEvidencePacket,
  ): ExplanationValidationResult {
    const serialized = this.serialize(candidate);
    if (serialized === null) {
      return {
        status: "invalid",
        failureCode: "invalid_explanation_schema",
      };
    }
    if (
      serialized.length >
      this.config.get("LLM_MAX_EXPLANATION_CHARACTERS", { infer: true })
    ) {
      return { status: "invalid", failureCode: "explanation_too_large" };
    }

    const parsed = impactExplanationSchema.safeParse(candidate);
    if (!parsed.success) {
      return {
        status: "invalid",
        failureCode: "invalid_explanation_schema",
      };
    }
    const explanation = parsed.data;
    const units = this.textUnits(explanation);
    const allText = units.map((unit) => unit.text).join("\n");
    if (
      PROMPT_INJECTION_OUTPUT_PATTERNS.some((pattern) =>
        pattern.test(allText),
      )
    ) {
      return {
        status: "invalid",
        failureCode: "prompt_injection_content",
      };
    }

    const evidenceIds = new Set([
      ...packet.evidence.map((item) => item.id),
      ...(packet.documentationContext ?? []).map((item) => item.id),
    ]);
    if (
      units.some((unit) =>
        unit.evidenceIds.some((id) => !evidenceIds.has(id)),
      )
    ) {
      return { status: "invalid", failureCode: "unknown_evidence_id" };
    }

    const allowedFiles = this.allowedFiles(packet);
    if (
      this.extractFilePaths(allText).some((path) => !allowedFiles.has(path))
    ) {
      return { status: "invalid", failureCode: "unknown_file_path" };
    }

    const allowedSymbols = this.allowedSymbols(packet);
    if (
      this.extractCodeSymbols(allText).some(
        (symbol) => !allowedSymbols.has(symbol),
      )
    ) {
      return { status: "invalid", failureCode: "unknown_symbol" };
    }
    if (this.overviewTechnicalNameCount(explanation) > 3) {
      return {
        status: "invalid",
        failureCode: "excessive_overview_technical_names",
      };
    }

    if (!this.relationshipsAreSupported(units, packet)) {
      return { status: "invalid", failureCode: "unsupported_relationship" };
    }
    if (!this.riskIsUnchanged(allText, packet)) {
      return { status: "invalid", failureCode: "altered_risk" };
    }
    if (!this.confidenceIsUnchanged(units, packet)) {
      return { status: "invalid", failureCode: "altered_confidence" };
    }
    if (!this.provenanceIsUnchanged(units, packet)) {
      return { status: "invalid", failureCode: "altered_provenance" };
    }
    if (!this.unknownsAreRepresented(explanation, packet)) {
      return { status: "invalid", failureCode: "missing_unknown_impact" };
    }
    if (
      explanation.claims.length < 2 ||
      explanation.claims.length > 6 ||
      explanation.implementationSteps.length < 2 ||
      explanation.implementationSteps.length > 5 ||
      explanation.verificationSteps.length < 2 ||
      explanation.verificationSteps.length > 4
    ) {
      return {
        status: "invalid",
        failureCode: "invalid_explanation_schema",
      };
    }

    return { status: "valid", explanation };
  }

  repairUnknownFilePaths(
    candidate: ImpactExplanation,
    packet: ImpactEvidencePacket,
  ): ImpactExplanation {
    const allowedFiles = this.allowedFiles(packet);
    const repairText = (text: string) =>
      this.replaceUnknownFilePaths(text, allowedFiles);

    return {
      ...candidate,
      executiveSummary: repairText(candidate.executiveSummary),
      answer: repairText(candidate.answer),
      claims: candidate.claims.map((claim) => ({
        ...claim,
        text: repairText(claim.text),
      })),
      implementationSteps: candidate.implementationSteps.map((step) => ({
        ...step,
        title: repairText(step.title),
        detail: repairText(step.detail),
      })),
      verificationSteps: candidate.verificationSteps.map((step) => ({
        ...step,
        text: repairText(step.text),
      })),
      remainingQuestions: candidate.remainingQuestions.map(repairText),
    };
  }

  private textUnits(explanation: ImpactExplanation): ExplanationTextUnit[] {
    const claimEvidenceIds = [
      ...new Set(
        explanation.claims.flatMap((claim) => claim.evidenceIds),
      ),
    ];
    return [
      {
        text: explanation.executiveSummary,
        evidenceIds: claimEvidenceIds,
        kind: "factual",
      },
      {
        text: explanation.answer,
        evidenceIds: claimEvidenceIds,
        kind: "factual",
      },
      ...explanation.claims.map((claim) => ({
        text: claim.text,
        evidenceIds: claim.evidenceIds,
        kind: "factual" as const,
      })),
      ...explanation.implementationSteps.map((step) => ({
        text: `${step.title}\n${step.detail}`,
        evidenceIds: step.evidenceIds,
        kind: "recommendation" as const,
      })),
      ...explanation.verificationSteps.map((step) => ({
        text: step.text,
        evidenceIds: step.evidenceIds,
        kind: "recommendation" as const,
      })),
      ...explanation.remainingQuestions.map((text) => ({
        text,
        evidenceIds: [],
        kind: "question" as const,
      })),
    ];
  }

  private allowedFiles(packet: ImpactEvidencePacket): Set<string> {
    return new Set(
      [
        ...packet.directImpacts.map((item) => item.filePath),
        ...packet.downstreamImpacts.map((item) => item.filePath),
        ...packet.unknownImpacts.map((item) => item.filePath),
        ...packet.relationshipPaths.map((item) => item.filePath),
        ...packet.evidence.flatMap((item) => [
          item.filePath,
          ...this.extractFilePaths(item.excerpt),
        ]),
      ].filter((path): path is string => Boolean(path)),
    );
  }

  private allowedSymbols(packet: ImpactEvidencePacket): Set<string> {
    return new Set(
      [
        ...packet.directImpacts.map((item) => item.symbol),
        ...packet.downstreamImpacts.map((item) => item.symbol),
        ...packet.evidence.map((item) => item.symbol),
        ...packet.evidence.flatMap((item) =>
          this.observedSourceIdentifiers(item.excerpt),
        ),
      ].filter((symbol): symbol is string => Boolean(symbol)),
    );
  }

  private observedSourceIdentifiers(excerpt: string): string[] {
    return [
      ...new Set([
        ...[...excerpt.matchAll(
          /\b([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g,
        )].flatMap((match) => (match[1] ? [match[1]] : [])),
        ...[...excerpt.matchAll(
          /\b([a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+)\b/g,
        )].flatMap((match) => (match[1] ? [match[1]] : [])),
      ]),
    ];
  }

  private extractFilePaths(text: string): string[] {
    const paths = new Set(
      [
        ...text.matchAll(
          new RegExp(SLASH_FILE_PATH_PATTERN.source, "g"),
        ),
      ].flatMap((match) => (match[1] ? [match[1]] : [])),
    );
    for (const match of text.matchAll(/`([^`\n]+)`/g)) {
      const value = match[1];
      if (
        value &&
        !value.includes("://") &&
        ((value.includes("/") &&
          /^[A-Za-z0-9_@()./ -]+$/.test(value)) ||
          STANDALONE_FILE_NAME_PATTERN.test(value))
      ) {
        paths.add(value);
      }
    }
    return [...paths];
  }

  private replaceUnknownFilePaths(
    text: string,
    allowedFiles: Set<string>,
  ): string {
    const withoutUnknownPaths = text.replace(
      new RegExp(SLASH_FILE_PATH_PATTERN.source, "g"),
      (match, path: string) =>
        allowedFiles.has(path)
          ? match
          : match.replace(path, "an unverified location"),
    );

    return withoutUnknownPaths.replace(
      /`([^`\n]+)`/g,
      (match, value: string) =>
        STANDALONE_FILE_NAME_PATTERN.test(value) &&
        !allowedFiles.has(value)
          ? "an unverified location"
          : match,
    );
  }

  private extractCodeSymbols(text: string): string[] {
    const symbols = new Set<string>();
    for (const match of text.matchAll(/`([^`\n]+)`/g)) {
      const value = match[1]?.replace(/\(\)$/, "");
      if (
        value &&
        !value.includes("/") &&
        /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(
          value,
        ) &&
        (/[A-Z_$]/.test(value) || value.includes("."))
      ) {
        symbols.add(value);
      }
    }
    for (const match of text.matchAll(
      /\b([A-Za-z_$][A-Za-z0-9_$]*)\(\)/g,
    )) {
      if (match[1]) symbols.add(match[1]);
    }
    return [...symbols];
  }

  private overviewTechnicalNameCount(
    explanation: ImpactExplanation,
  ): number {
    const overview = `${explanation.answer}\n${explanation.executiveSummary}`;
    return new Set([
      ...this.extractFilePaths(overview).map((path) => `file:${path}`),
      ...this.extractCodeSymbols(overview).map(
        (symbol) => `symbol:${symbol}`,
      ),
    ]).size;
  }

  private relationshipsAreSupported(
    units: ExplanationTextUnit[],
    packet: ImpactEvidencePacket,
  ): boolean {
    const citations = new Map(packet.evidence.map((item) => [item.id, item]));
    const relationshipCitations = packet.evidence.filter(
      (item) => RELATIONSHIP_PROVENANCES.has(item.provenance),
    );

    return units.every((unit) => {
      if (unit.kind !== "factual") return true;
      const mentionedPaths = this.extractFilePaths(unit.text);
      const usesMultipleFiles =
        mentionedPaths.length >= 2 && /\b(uses?|consumes?)\b/i.test(unit.text);
      if (!RELATIONSHIP_PATTERN.test(unit.text) && !usesMultipleFiles) {
        return true;
      }
      if (mentionedPaths.length === 0) return true;
      const assertsCall = /\bcalls?\b/i.test(unit.text);
      // General dependency language around one named surface is explanatory,
      // not a claim about a new edge. Only validate it as a relationship when
      // the text connects multiple files or explicitly asserts a call.
      if (mentionedPaths.length < 2 && !assertsCall) return true;
      const scopedCitations = unit.evidenceIds.length
        ? unit.evidenceIds
            .map((id) => citations.get(id))
            .filter(
              (item): item is ImpactEvidencePacketCitation =>
                Boolean(
                  item && RELATIONSHIP_PROVENANCES.has(item.provenance),
                ),
            )
        : relationshipCitations;
      if (unit.evidenceIds.length && scopedCitations.length === 0) return false;
      const historicalOnly = scopedCitations.every(
        (citation) => citation.provenance === "historical_relationship",
      );
      if (
        historicalOnly &&
        !/\b(historical(?:ly)?|previously|former(?:ly)?|used to|prior revision)\b/i.test(
          unit.text,
        )
      ) {
        return false;
      }
      if (
        assertsCall &&
        !scopedCitations.some(
          (citation) =>
            citation.provenance === "typescript_public_api_call" ||
            (citation.provenance === "historical_relationship" &&
              /\btypescript_public_api_call\b/.test(citation.excerpt)),
        )
      ) {
        return false;
      }
      if (mentionedPaths.length < 2) return true;

      return scopedCitations.some((citation) => {
        const supportedPaths = new Set([
          citation.filePath,
          ...this.extractFilePaths(citation.excerpt),
        ]);
        return mentionedPaths.every((path) => supportedPaths.has(path));
      });
    });
  }

  private riskIsUnchanged(
    text: string,
    packet: ImpactEvidencePacket,
  ): boolean {
    if (
      /\b(critical|severe|elevated|moderate|minimal|negligible)[\s-]+risk\b|\brisk\s+(?:is\s+)?(critical|severe|elevated|moderate|minimal|negligible)\b/i.test(
        text,
      )
    ) {
      return false;
    }
    for (const match of text.matchAll(
      /\b(insufficient|low|medium|high)[\s-]+risk\b|\brisk(?:\s+level)?\s*(?:is|:|=)?\s*(insufficient|low|medium|high)\b/gi,
    )) {
      const level = (match[1] ?? match[2])?.toLowerCase();
      if (level !== packet.risk.level) return false;
    }
    for (const match of text.matchAll(
      /\brisk\s+score\s*(?:is|:|=|of)?\s*(\d+(?:\.\d+)?)\b/gi,
    )) {
      if (
        packet.risk.score === null ||
        Number(match[1]) !== packet.risk.score
      ) {
        return false;
      }
    }
    return true;
  }

  private confidenceIsUnchanged(
    units: ExplanationTextUnit[],
    packet: ImpactEvidencePacket,
  ): boolean {
    const findings = this.allFindings(packet);
    return units.every((unit) => {
      if (
        /\b(?:low|medium|high)\s+confidence\b|\bconfidence\s+(?:is\s+)?(?:low|medium|high)\b/i.test(
          unit.text,
        )
      ) {
        return false;
      }
      const values = [
        ...unit.text.matchAll(
          /\bconfidence(?:\s+(?:score|of))?\s*(?:is|:|=)?\s*(\d+(?:\.\d+)?%?)|(\d+(?:\.\d+)?%)\s+confidence\b/gi,
        ),
      ].flatMap((match) => {
        const value = match[1] ?? match[2];
        return value ? [this.confidenceValue(value)] : [];
      });
      if (values.length === 0) return true;
      const supported = findings
        .filter((finding) =>
          finding.evidenceIds.some((id) => unit.evidenceIds.includes(id)),
        )
        .map((finding) => finding.confidence);
      return (
        supported.length > 0 &&
        values.every((value) =>
          supported.some((item) => Math.abs(item - value) < 0.000_001),
        )
      );
    });
  }

  private provenanceIsUnchanged(
    units: ExplanationTextUnit[],
    packet: ImpactEvidencePacket,
  ): boolean {
    const citations = new Map(packet.evidence.map((item) => [item.id, item]));
    const findings = this.allFindings(packet);

    return units.every((unit) => {
      if (unit.kind !== "factual") return true;
      if (
        /\b(runtime observation|runtime trace|dynamic analysis|test execution)\b/i.test(
          unit.text,
        )
      ) {
        return false;
      }
      const mentioned = PROVENANCE_PATTERNS.filter(({ pattern }) =>
        pattern.test(unit.text),
      ).map(({ value }) => value);
      if (mentioned.length === 0) return true;

      const supported = new Set([
        ...unit.evidenceIds.flatMap((id) => {
          const citation = citations.get(id);
          return citation ? [citation.provenance] : [];
        }),
        ...findings
          .filter((finding) =>
            finding.evidenceIds.some((id) => unit.evidenceIds.includes(id)),
          )
          .map((finding) => finding.provenance),
      ]);
      if (unit.evidenceIds.length === 0) {
        packet.unknownImpacts.forEach((item) =>
          supported.add(item.provenance),
        );
      }
      return mentioned.every((value) => supported.has(value));
    });
  }

  private unknownsAreRepresented(
    explanation: ImpactExplanation,
    packet: ImpactEvidencePacket,
  ): boolean {
    if (
      (packet.limitations.length > 0 || packet.unknownImpacts.length > 0) &&
      explanation.remainingQuestions.length === 0
    ) {
      return false;
    }
    const questions = this.normalize(explanation.remainingQuestions.join("\n"));
    return packet.unknownImpacts.every((unknown) =>
      questions.includes(this.normalize(unknown.title)),
    );
  }

  private allFindings(
    packet: ImpactEvidencePacket,
  ): ImpactEvidencePacketFinding[] {
    return [
      ...packet.directImpacts,
      ...packet.downstreamImpacts,
      ...packet.unknownImpacts,
    ];
  }

  private confidenceValue(value: string): number {
    return value.endsWith("%")
      ? Number(value.slice(0, -1)) / 100
      : Number(value);
  }

  private normalize(value: string): string {
    return value.toLowerCase().replace(/\s+/g, " ").trim();
  }

  private serialize(value: unknown): string | null {
    try {
      return JSON.stringify(value) ?? null;
    } catch {
      return null;
    }
  }
}
