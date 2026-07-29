import type { ImpactExplanationState } from "./explanation.types";

export interface ImpactExplanationAuditEvent {
  action:
    | "impact.explanation.completed"
    | "impact.explanation.fallback"
    | "impact.explanation.disabled";
  metadata: Record<string, unknown>;
}

export function explanationAuditEvent(
  state: ImpactExplanationState,
): ImpactExplanationAuditEvent | null {
  if (state.status === "pending") return null;
  if (state.status === "disabled") {
    return {
      action: "impact.explanation.disabled",
      metadata: {
        status: state.status,
        outputSchemaVersion: state.schemaVersion,
      },
    };
  }

  const metadata = state.metadata;
  return {
    action:
      state.status === "completed"
        ? "impact.explanation.completed"
        : "impact.explanation.fallback",
    metadata: {
      status: state.status,
      provider: metadata?.provider ?? null,
      model: metadata?.model ?? null,
      promptVersion: metadata?.promptVersion ?? null,
      outputSchemaVersion:
        metadata?.outputSchemaVersion ?? state.schemaVersion,
      evidencePacketHash: metadata?.evidencePacketHash ?? null,
      sourceRevision: metadata?.sourceRevision ?? null,
      generatedAt: metadata?.generatedAt ?? null,
      latencyMs: metadata?.latencyMs ?? 0,
      inputTokens: metadata?.usage.inputTokens ?? 0,
      outputTokens: metadata?.usage.outputTokens ?? 0,
      totalTokens: metadata?.usage.totalTokens ?? 0,
      validationStatus: metadata?.validationStatus ?? "not_run",
      failureCode:
        metadata?.failureCode ??
        (state.status === "failed" ? (state.failureCode ?? null) : null),
      deterministicFallback:
        metadata?.deterministicFallback ?? state.status === "failed",
    },
  };
}
