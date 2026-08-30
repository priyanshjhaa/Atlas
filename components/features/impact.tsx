"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  Box,
  Check,
  Code2,
  FileText,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  Link2,
  Network,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  X,
  Zap,
} from "lucide-react";
import { PageHeader } from "@/components/app/shared";
import { ConfidenceBadge } from "@/components/brand";
import type {
  AtlasGitHubActor,
  AtlasImpactExplanation,
  AtlasImpactExplanationState,
  AtlasImpactFinding,
  AtlasImpactReport,
  AtlasNotionConnector,
  AtlasNotionResource,
  AtlasRepository,
  AtlasWorkspace,
} from "@/lib/api-types";
import { notionEditorAttribution } from "@/lib/notion-provenance";

function githubActorLabel(
  actor: AtlasGitHubActor | null | undefined,
  fallback = "User unavailable",
) {
  return actor?.displayName ?? actor?.login ?? fallback;
}

function reviewStateLabel(state: string) {
  return state
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function confidenceType(
  provenance: AtlasImpactFinding["provenance"],
): "observed" | "historical" | "inferred" {
  if (provenance === "historical_relationship") return "historical";
  return provenance === "analysis_gap" ? "inferred" : "observed";
}

function ImpactFindingCard({ item }: { item: AtlasImpactFinding }) {
  const evidence = item.filePath
    ? `${item.repository}/${item.filePath}`
    : item.repository;
  const confidence = confidenceType(item.provenance);
  return (
    <article className="impact-card">
      <div className="impact-card__icon">
        {item.kind === "Consumer" ? (
          <Link2 size={17} />
        ) : item.kind === "Unknown" ? (
          <AlertTriangle size={17} />
        ) : item.kind === "File" ? (
          <FileText size={17} />
        ) : (
          <Code2 size={17} />
        )}
      </div>
      <div className="impact-card__copy">
        <span>
          {item.kind} · {Math.round(item.confidence * 100)}% confidence
        </span>
        <h3>{item.title}</h3>
        <p>{item.detail}</p>
        <code>{evidence}</code>
      </div>
      <ConfidenceBadge type={confidence} />
    </article>
  );
}

function evidenceDomId(evidenceId: string) {
  return `evidence-${evidenceId.replace(/[^A-Za-z0-9_-]/g, "-")}`;
}

type PracticalBriefing = Omit<AtlasImpactExplanation, "schemaVersion">;

function briefingFallbackMessage(
  state: AtlasImpactExplanationState | null | undefined,
): { title: string; detail: string } {
  if (state?.status === "pending") {
    return {
      title: "AI briefing is still generating",
      detail: "Atlas’s verified handoff is available while the provider finishes.",
    };
  }
  const failureCode = state?.status === "failed"
    ? state.failureCode ?? state.metadata?.failureCode
    : null;
  if (failureCode === "provider_rate_limited") {
    return {
      title: "AI provider limit reached",
      detail: "The provider could not accept this request yet. Atlas assembled a verified fallback you can use now.",
    };
  }
  if (failureCode?.startsWith("provider_") || failureCode === "configuration_error") {
    return {
      title: "AI provider unavailable",
      detail: "Atlas assembled this fallback directly from the verified report. You can retry without rerunning the analysis.",
    };
  }
  if (failureCode) {
    return {
      title: "AI briefing did not pass verification",
      detail: "Atlas rejected the generated prose and kept this source-backed fallback instead.",
    };
  }
  return {
    title: "Verified Atlas briefing",
    detail: "This handoff was assembled directly from the source-backed report.",
  };
}

function practicalBriefing(
  state: AtlasImpactExplanationState | null | undefined,
  result: AtlasImpactReport["result"],
): { briefing: PracticalBriefing; generated: boolean } {
  if (state?.status === "completed" && state.schemaVersion === "2") {
    return { briefing: state.explanation, generated: true };
  }
  if (state?.status === "completed" && state.schemaVersion === "1") {
    const legacy = state.explanation;
    const claimEvidence = [...new Set(legacy.claims.flatMap((item) => item.evidenceIds))];
    return {
      generated: true,
      briefing: {
        bottomLine: {
          text: [legacy.answer, legacy.executiveSummary].filter(Boolean).join(" "),
          evidenceIds: claimEvidence,
        },
        practicalImpacts: [{
          audience: "engineering",
          text: legacy.claims[0]?.text ?? legacy.executiveSummary,
          evidenceIds: legacy.claims[0]?.evidenceIds ?? claimEvidence,
        }],
        nextActions: legacy.implementationSteps.slice(0, 3).map((item) => ({
          text: `${item.title}: ${item.detail}`,
          evidenceIds: item.evidenceIds,
        })),
        verificationChecks: legacy.verificationSteps.slice(0, 2),
        openQuestions: legacy.remainingQuestions.slice(0, 2),
      },
    };
  }

  const fallbackIds = result.evidence.slice(0, 3).map((item) => item.id);
  return {
    generated: false,
    briefing: {
      bottomLine: { text: result.answer || result.executiveSummary, evidenceIds: fallbackIds },
      practicalImpacts: [{ audience: "engineering", text: result.executiveSummary, evidenceIds: fallbackIds }],
      nextActions: (result.recommendations ?? []).slice(0, 3).map((text) => ({ text, evidenceIds: fallbackIds })),
      verificationChecks: result.verificationPlan.slice(0, 2).map((text) => ({ text, evidenceIds: fallbackIds })),
      openQuestions: result.unknownImpacts.slice(0, 2).map((item) => item.title),
    },
  };
}

function PracticalAIExplanation({
  state,
  reportId,
  result,
  retrying,
  retryError,
  onRetry,
}: {
  state: AtlasImpactExplanationState | null | undefined;
  reportId: string;
  result: AtlasImpactReport["result"];
  retrying: boolean;
  retryError: string;
  onRetry: () => void;
}) {
  const { briefing, generated } = practicalBriefing(state, result);
  const fallbackMessage = briefingFallbackMessage(state);
  const metadata = state?.status === "completed" ? state.metadata : undefined;
  const evidenceIds = new Set([
    ...briefing.bottomLine.evidenceIds,
    ...briefing.practicalImpacts.flatMap((item) => item.evidenceIds),
    ...briefing.nextActions.flatMap((item) => item.evidenceIds),
    ...briefing.verificationChecks.flatMap((item) => item.evidenceIds),
  ]);
  const verifiedSourceCount = result.evidence.filter((item) => evidenceIds.has(item.id)).length;
  const failureCode = state?.status === "failed"
    ? state.failureCode ?? state.metadata?.failureCode
    : null;

  return (
    <section className="practical-briefing panel" aria-labelledby="practical-briefing-title">
      <header className="practical-briefing__header">
        <div>
          <span className="explanation-label"><Sparkles size={14} /> {generated ? "AI briefing" : "Verified fallback"}</span>
          <h2 id="practical-briefing-title">Bottom line</h2>
        </div>
        {metadata?.model && <small>{metadata.provider} · {metadata.model}</small>}
      </header>

      {!generated && (
        <div className="practical-briefing__status" role={failureCode ? "alert" : "status"}>
          <div>
            <strong>{fallbackMessage.title}</strong>
            <p>{fallbackMessage.detail}</p>
          </div>
          {(state?.status === "failed" || !state) && (
            <button className="button button--ghost" type="button" onClick={onRetry} disabled={retrying}>
              <RefreshCw className={retrying ? "spin" : ""} size={14} />
              {retrying ? "Retrying…" : "Retry briefing"}
            </button>
          )}
        </div>
      )}
      {retryError && <p className="explanation-retry-error" role="alert">{retryError}</p>}

      <p className="practical-briefing__bottom-line">{briefing.bottomLine.text}</p>

      <section className="practical-briefing__section" aria-labelledby="practical-impact-title">
        <div className="practical-briefing__heading"><span>01</span><h3 id="practical-impact-title">Practical impact</h3></div>
        <div className="practical-impact-grid">
          {briefing.practicalImpacts.map((item) => (
            <article key={item.audience}><span>{item.audience}</span><p>{item.text}</p></article>
          ))}
        </div>
      </section>

      <div className="practical-briefing__guidance">
        <section className="practical-briefing__section" aria-labelledby="next-move-title">
          <div className="practical-briefing__heading"><span>02</span><h3 id="next-move-title">Recommended next move</h3></div>
          <ol>{briefing.nextActions.map((item, index) => <li key={`${item.text}:${index}`}>{item.text}</li>)}</ol>
        </section>
        <section className="practical-briefing__section" aria-labelledby="before-merge-title">
          <div className="practical-briefing__heading"><span>03</span><h3 id="before-merge-title">Before merge</h3></div>
          <ul>{briefing.verificationChecks.map((item, index) => <li key={`${item.text}:${index}`}>{item.text}</li>)}</ul>
        </section>
      </div>

      {briefing.openQuestions.length > 0 && (
        <section className="practical-briefing__questions" aria-labelledby="open-question-title">
          <div><AlertTriangle size={16} /><span><b id="open-question-title">Top unresolved question</b><small>{result.unknownImpacts.length} Atlas unknown{result.unknownImpacts.length === 1 ? "" : "s"} · complete context in Findings</small></span></div>
          <ul>{briefing.openQuestions.map((question) => <li key={question}>{question}</li>)}</ul>
        </section>
      )}

      <footer className="practical-briefing__footer">
        <span><ShieldCheck size={14} /> Based on {verifiedSourceCount} verified source{verifiedSourceCount === 1 ? "" : "s"}</span>
        <nav aria-label="Briefing source details">
          <Link href={`/app/impact/${reportId}/findings`}>Open Atlas Findings <ArrowRight size={13} /></Link>
          <Link href={`/app/impact/${reportId}/evidence`}>View evidence <ArrowRight size={13} /></Link>
        </nav>
      </footer>
    </section>
  );
}

export function ImpactNewPage({
  notionConnectors,
  notionResources,
  repositories,
  workspace,
}: {
  notionConnectors: AtlasNotionConnector[];
  notionResources: AtlasNotionResource[];
  repositories: AtlasRepository[];
  workspace: AtlasWorkspace;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<"change" | "notion">("change");
  const [mode, setMode] = useState<"planned" | "pull-request">("planned");
  const [description, setDescription] = useState("");
  const [pullRequestNumber, setPullRequestNumber] = useState("");
  const [running, setRunning] = useState(false);
  const [repositoryId, setRepositoryId] = useState(repositories[0]?.id ?? "");
  const [scope, setScope] = useState<"workspace" | "repository">("repository");
  const [anchors, setAnchors] = useState<string[]>([]);
  const [anchorInput, setAnchorInput] = useState("");
  const [error, setError] = useState("");
  const selectedRepository = useMemo(
    () => repositories.find((repository) => repository.id === repositoryId),
    [repositories, repositoryId],
  );
  const activeNotionConnector = notionConnectors.find(
    (connector) => connector.status === "active",
  );
  const selectedNotionResources = notionResources.filter(
    (resource) => resource.isActive && resource.isSelected,
  );
  const synchronizedNotionResources = selectedNotionResources.filter(
    (resource) => resource.lastSyncedAt,
  );
  const notionReady = Boolean(
    activeNotionConnector && synchronizedNotionResources.length,
  );
  const steps = [
    "Resolve indexed entities",
    "Traverse observed imports",
    notionReady ? "Retrieve Notion decisions" : "Rank source evidence",
    "Record analysis gaps",
    "Persist the report",
  ];

  async function analyze() {
    const parsedPullRequestNumber = Number(pullRequestNumber);
    if (
      !repositoryId ||
      (mode === "planned" && description.trim().length < 10) ||
      (mode === "pull-request" &&
        (!Number.isInteger(parsedPullRequestNumber) ||
          parsedPullRequestNumber < 1))
    ) {
      return;
    }
    setRunning(true);
    setError("");
    try {
      const response = await fetch("/api/impact-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: workspace.id,
          repositoryId,
          mode,
          description:
            mode === "planned" ? description.trim() : undefined,
          pullRequestNumber:
            mode === "pull-request" ? parsedPullRequestNumber : undefined,
          scope,
          anchors: mode === "planned" ? anchors : undefined,
        }),
      });
      const result = (await response.json()) as {
        id?: string;
        message?: string | string[];
      };
      if (!response.ok || !result.id) {
        const message = Array.isArray(result.message)
          ? result.message.join(" ")
          : result.message;
        throw new Error(message ?? "Atlas could not create the impact report.");
      }
      router.push(`/app/impact/${result.id}`);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Atlas could not create the impact report.",
      );
      setRunning(false);
    }
  }

  function addAnchor() {
    const anchor = anchorInput.trim();
    if (!anchor || anchors.includes(anchor)) return;
    setAnchors((current) => [...current, anchor]);
    setAnchorInput("");
  }

  return (
    <>
      <PageHeader
        eyebrow="Evidence-backed change intelligence"
        title="Analyze a planned change or pull request"
        detail="Describe a proposed change or select a GitHub pull request. Atlas resolves modification anchors, traverses direct and downstream relationships across the chosen scope, retrieves relevant history and documentation, scores risk, and returns cited findings, unknowns, recommendations, and a verification plan."
      />
      {error && (
        <p className="action-notice action-notice--error" role="alert">
          {error}
        </p>
      )}
      <div className="analysis-layout">
        <section className="analysis-form panel">
          <nav className="impact-input-stages" aria-label="Impact analysis inputs">
            <button
              className={stage === "change" ? "active" : ""}
              onClick={() => setStage("change")}
              aria-current={stage === "change" ? "step" : undefined}
            >
              <span>01</span>
              <div><b>Define the change</b><small>Plan or pull request</small></div>
              <Check size={14} />
            </button>
            <button
              className={stage === "notion" ? "active" : ""}
              onClick={() => setStage("notion")}
              aria-current={stage === "notion" ? "step" : undefined}
            >
              <span>02</span>
              <div><b>Notion context</b><small>{notionReady ? `${synchronizedNotionResources.length} sources ready` : "Review availability"}</small></div>
              <BookOpenText size={14} />
            </button>
          </nav>
          {stage === "change" ? <div className="impact-change-inputs">
          <div className="segmented" role="tablist" aria-label="Change input type">
            <button
              className={mode === "planned" ? "active" : ""}
              onClick={() => setMode("planned")}
              aria-pressed={mode === "planned"}
            >
              <Sparkles size={15} /> Planned change
            </button>
            <button
              className={mode === "pull-request" ? "active" : ""}
              onClick={() => setMode("pull-request")}
              aria-pressed={mode === "pull-request"}
            >
              <GitPullRequest size={15} /> Pull request
            </button>
          </div>
          {repositories.length ? (
            <>
              <label className="field">
                <span>Repository</span>
                <div className="select-like">
                  <GitBranch size={16} />
                  <select
                    value={repositoryId}
                    onChange={(event) => setRepositoryId(event.target.value)}
                  >
                    {repositories.map((repository) => (
                      <option value={repository.id} key={repository.id}>
                        {repository.owner}/{repository.name}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
              <div className="field-row">
                <label className="field">
                  <span>Indexed revision</span>
                  <div className="select-like">
                    <GitBranch size={15} />
                    <input
                      value={
                        selectedRepository?.defaultBranch
                          ? `${selectedRepository.defaultBranch} · latest sync`
                          : "Latest synchronized revision"
                      }
                      readOnly
                    />
                  </div>
                </label>
                <label className="field">
                  <span>Scope</span>
                  <div className="select-like">
                    <Network size={15} />
                    <select
                      value={scope}
                      onChange={(event) =>
                        setScope(
                          event.target.value as "workspace" | "repository",
                        )
                      }
                    >
                      <option value="repository">Current repository</option>
                      <option value="workspace">Entire workspace</option>
                    </select>
                  </div>
                </label>
              </div>
              {mode === "planned" ? (
                <>
                  <label className="field">
                    <span>Describe the intended change</span>
                    <textarea
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="Example: Change the Better Auth session validation so revoked sessions are rejected before workspace data is loaded."
                    />
                    <small>
                      Include exact contracts, symbols, file paths, or behavior
                      when you know them.
                    </small>
                  </label>
                  <div className="field">
                    <span>
                      Anchors <em>optional</em>
                    </span>
                    <div className="anchor-box">
                      {anchors.map((anchor) => (
                        <span key={anchor}>
                          <Code2 size={13} />
                          {anchor}
                          <button
                            onClick={() =>
                              setAnchors((current) =>
                                current.filter((item) => item !== anchor),
                              )
                            }
                            aria-label={`Remove ${anchor}`}
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                      <input
                        value={anchorInput}
                        onChange={(event) =>
                          setAnchorInput(event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addAnchor();
                          }
                        }}
                        placeholder="File path or symbol"
                        aria-label="New entity anchor"
                      />
                      <button
                        onClick={addAnchor}
                        disabled={!anchorInput.trim()}
                      >
                        <Plus size={14} /> Add entity
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <label className="field">
                    <span>GitHub pull request number</span>
                    <div className="select-like">
                      <GitPullRequest size={16} />
                      <input
                        type="number"
                        min="1"
                        inputMode="numeric"
                        value={pullRequestNumber}
                        onChange={(event) =>
                          setPullRequestNumber(event.target.value)
                        }
                        placeholder="Example: 42"
                      />
                    </div>
                    <small>
                      Atlas loads the title, body, changed files, and bounded
                      patch context through the repository&apos;s GitHub App
                      installation.
                    </small>
                  </label>
                  <div className="pr-preview">
                    <GitBranch size={20} />
                    <div>
                      <span>
                        {selectedRepository?.owner}/
                        {selectedRepository?.name}
                      </span>
                      <h3>
                        {pullRequestNumber
                          ? `Analyze pull request #${pullRequestNumber}`
                          : "Enter a pull request number"}
                      </h3>
                      <p>
                        Changed files are resolved against the latest
                        synchronized base revision.
                      </p>
                    </div>
                    <ShieldCheck size={17} />
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="empty-state">
              <Box size={22} />
              <h2>No synchronized repositories</h2>
              <p>
                Connect and synchronize a repository before analyzing a
                planned change.
              </p>
              <Link className="button button--primary" href="/app/sources">
                Open sources
              </Link>
            </div>
          )}
          </div> : (
            <section className="notion-impact-context" aria-labelledby="notion-impact-title">
              <header>
                <div className="notion-impact-context__mark">N</div>
                <div>
                  <span>Documentation retrieval</span>
                  <h2 id="notion-impact-title">Bring the decisions behind the code into this analysis.</h2>
                  <p>Atlas uses the change description or pull request as a semantic query, retrieves the most relevant synchronized Notion chunks, and adds up to eight source-linked citations to the report.</p>
                </div>
                <i className={notionReady ? "is-ready" : "needs-context"}>{notionReady ? "Ready" : "Setup needed"}</i>
              </header>

              <div className="notion-impact-context__metrics">
                <article><strong>{selectedNotionResources.length}</strong><span>Selected sources</span></article>
                <article><strong>{synchronizedNotionResources.length}</strong><span>Synchronized</span></article>
                <article><strong>8</strong><span>Maximum citations</span></article>
              </div>

              {selectedNotionResources.length ? (
                <div className="notion-impact-context__resources">
                  <div><span>Available to this analysis</span><small>Workspace-approved only</small></div>
                  {selectedNotionResources.slice(0, 6).map((resource) => (
                    <article key={resource.id}>
                      <BookOpenText size={15} />
                      <div><b>{resource.title}</b><small>{resource.kind.replace("_", " ")} · {resource.lastSyncedAt ? "indexed" : "waiting for sync"}</small></div>
                      {resource.url ? <a href={resource.url} target="_blank" rel="noreferrer" aria-label={`Open ${resource.title} in Notion`}><ExternalLink size={14} /></a> : <span />}
                    </article>
                  ))}
                  {selectedNotionResources.length > 6 && <p>+{selectedNotionResources.length - 6} more approved sources will also be searched.</p>}
                </div>
              ) : (
                <div className="notion-impact-context__empty">
                  <BookOpenText size={22} />
                  <div><b>No Notion context is available yet.</b><p>Connect Notion and select the ADRs, specifications, decisions, or runbooks Atlas may index.</p></div>
                  <Link className="button button--ghost" href="/app/sources">Manage Notion</Link>
                </div>
              )}

              <div className="notion-impact-context__boundary">
                <ShieldCheck size={17} />
                <p><b>Grounding boundary</b><span>Notion provides cited decision context. It cannot create graph relationships or change deterministic findings, risk, confidence, or unknowns.</span></p>
              </div>
            </section>
          )}
          <div className="form-footer">
            <p>
              <ShieldCheck size={15} /> {notionReady ? "Code evidence and Notion context are ready." : "Analysis remains available with code evidence only."}
            </p>
            <button
              onClick={() => void analyze()}
              disabled={
                running ||
                !repositoryId ||
                (mode === "planned" && description.trim().length < 10) ||
                (mode === "pull-request" &&
                  (!Number.isInteger(Number(pullRequestNumber)) ||
                    Number(pullRequestNumber) < 1))
              }
              className="button button--primary"
            >
              {running ? (
                <>
                  <RefreshCw className="spin" size={16} /> Analyzing…
                </>
              ) : (
                <>
                  <Zap size={16} /> Analyze impact
                </>
              )}
            </button>
          </div>
        </section>
        <aside className="analysis-aside">
          <span className="aside-label">How Atlas reasons</span>
          <div className="reasoning-steps">
            {steps.map((step, index) => (
              <div key={step} className={running ? "is-running" : ""}>
                <i>{running ? <Check size={12} /> : index + 1}</i>
                <span>{step}</span>
              </div>
            ))}
          </div>
          <div className="coverage-card">
            <span>Live index coverage</span>
            <strong>{repositories.length}</strong>
            <p>
              synchronized repositor{repositories.length === 1 ? "y is" : "ies are"}{" "}
              available in {workspace.name}.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}

export type ImpactReportView = "overview" | "findings" | "plan" | "evidence";

function ReportNavigation({
  reportId,
  activeView,
}: {
  reportId: string;
  activeView: ImpactReportView;
}) {
  const basePath = `/app/impact/${reportId}`;
  const items: Array<{
    view: ImpactReportView;
    label: string;
    detail: string;
    href: string;
  }> = [
    { view: "overview", label: "Brief", detail: "Decision", href: basePath },
    { view: "findings", label: "Findings", detail: "Blast radius", href: `${basePath}/findings` },
    { view: "plan", label: "Plan", detail: "Execution", href: `${basePath}/plan` },
    { view: "evidence", label: "Evidence", detail: "Sources", href: `${basePath}/evidence` },
  ];

  return (
    <nav className="report-navigation" aria-label="Impact report sections">
      {items.map((item, index) => (
        <Link
          key={item.view}
          href={item.href}
          className={activeView === item.view ? "active" : ""}
          aria-label={item.label}
          aria-current={activeView === item.view ? "page" : undefined}
        >
          <i>0{index + 1}</i>
          <span>{item.label}<small>{item.detail}</small></span>
        </Link>
      ))}
    </nav>
  );
}

export function ImpactReportPage({
  report,
  view = "overview",
}: {
  report: AtlasImpactReport;
  view?: ImpactReportView;
}) {
  const [currentReport, setCurrentReport] = useState(report);
  const [retryingExplanation, setRetryingExplanation] = useState(false);
  const [explanationRetryError, setExplanationRetryError] = useState("");
  const [reportMode, setReportMode] = useState<"briefing" | "atlas">(
    "briefing",
  );
  const [feedbackRating, setFeedbackRating] = useState<
    "useful" | "not_useful" | null
  >(report.viewerFeedback?.rating ?? null);
  const [confirmedFindingIds, setConfirmedFindingIds] = useState<string[]>(
    report.viewerFeedback?.confirmedFindingIds ?? [],
  );
  const [missedImpact, setMissedImpact] = useState(
    report.viewerFeedback?.missedImpact ?? "",
  );
  const [feedbackComment, setFeedbackComment] = useState(
    report.viewerFeedback?.comment ?? "",
  );
  const [feedbackStatus, setFeedbackStatus] = useState("");
  const [savingFeedback, setSavingFeedback] = useState(false);
  const { result } = currentReport;
  const downstreamAndUnknown = [
    ...result.downstreamImpacts,
    ...result.unknownImpacts,
  ];
  const generatedAt = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(result.generatedAt));
  const affectedCount =
    result.directImpacts.length + result.downstreamImpacts.length;

  async function retryExplanation() {
    setRetryingExplanation(true);
    setExplanationRetryError("");
    try {
      const response = await fetch(
        `/api/impact-reports/${currentReport.id}/explanation/retry`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId: currentReport.workspaceId }),
        },
      );
      const nextReport = (await response.json()) as AtlasImpactReport & {
        message?: string | string[];
      };
      if (!response.ok || !nextReport.result) {
        const message = Array.isArray(nextReport.message)
          ? nextReport.message.join(" ")
          : nextReport.message;
        throw new Error(message ?? "Atlas could not retry the explanation.");
      }
      setCurrentReport(nextReport);
    } catch (reason) {
      setExplanationRetryError(
        reason instanceof Error
          ? reason.message
          : "Atlas could not retry the explanation.",
      );
    } finally {
      setRetryingExplanation(false);
    }
  }

  async function submitFeedback(rating: "useful" | "not_useful") {
    setSavingFeedback(true);
    setFeedbackStatus("");
    try {
      const response = await fetch(
        `/api/impact-reports/${currentReport.id}/feedback`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: currentReport.workspaceId,
            rating,
            confirmedFindingIds,
            missedImpact,
            comment: feedbackComment,
          }),
        },
      );
      if (!response.ok) throw new Error("Atlas could not save this feedback.");
      setFeedbackRating(rating);
      setFeedbackStatus("Feedback saved. Thank you.");
    } catch (reason) {
      setFeedbackStatus(
        reason instanceof Error
          ? reason.message
          : "Atlas could not save this feedback.",
      );
    } finally {
      setSavingFeedback(false);
    }
  }

  return (
    <div className={`impact-report impact-report--${view}`}>
      <div className="report-top">
        <Link href="/app/impact/new">
          <ArrowLeft size={15} /> New analysis
        </Link>
        <div>
          <span>Generated {generatedAt}</span>
          {report.input.pullRequest ? (
            <a
              className="button button--ghost"
              href={report.input.pullRequest.url}
              target="_blank"
              rel="noreferrer"
            >
              <GitPullRequest size={15} /> Open PR #
              {report.input.pullRequest.number}
            </a>
          ) : (
            <Link className="button button--ghost" href="/app/sources">
              <GitBranch size={15} /> View source
            </Link>
          )}
        </div>
      </div>
      <section className="report-hero report-hero--compact">
        <div className="report-hero__copy">
          <p className="eyebrow">
            <Sparkles size={14} /> Live impact report
          </p>
          <h1>{result.title}</h1>
          <div className="report-hero__metadata">
            <span>{result.repository.owner}/{result.repository.name}</span>
            {report.input.pullRequest ? (
              <span>
                PR #{report.input.pullRequest.number} · opened by{" "}
                {githubActorLabel(
                  report.input.pullRequest.authorDetails,
                  report.input.pullRequest.author,
                )}
              </span>
            ) : null}
            <span>Revision {result.sourceRevision.slice(0, 12)}</span>
          </div>
          {report.input.pullRequest &&
          (report.input.pullRequest.reviewers?.length ||
            report.input.pullRequest.mergedBy) ? (
            <div
              className="pull-request-provenance"
              aria-label="Pull request provenance"
            >
              {report.input.pullRequest.reviewers?.map((review, index) => (
                <a
                  href={review.url}
                  target="_blank"
                  rel="noreferrer"
                  key={`${review.actor?.providerUserId ?? "unknown"}-${index}`}
                >
                  <b>{githubActorLabel(review.actor, "Reviewer unavailable")}</b>
                  <span>{reviewStateLabel(review.state)}</span>
                </a>
              ))}
              {report.input.pullRequest.mergedBy ? (
                <a
                  href={
                    report.input.pullRequest.mergedBy.profileUrl ??
                    report.input.pullRequest.url
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  <b>{githubActorLabel(report.input.pullRequest.mergedBy)}</b>
                  <span>Merged by</span>
                </a>
              ) : null}
              {report.input.pullRequest.reviewsTruncated ? (
                <small>Older reviews are not shown</small>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="risk-score" aria-label="Change risk">
          <span>Change risk</span>
          <strong>
            {result.risk.score === null
              ? "Not scored"
              : `${result.risk.level.charAt(0).toUpperCase()}${result.risk.level.slice(1)}`}
          </strong>
          <p>{result.risk.reasons.join(" · ")}</p>
        </div>
        <div className="impact-snapshot" aria-label="Impact at a glance">
          <div>
            <strong>{affectedCount}</strong>
            <span>Affected</span>
            <small>{result.directImpacts.length} direct · {result.downstreamImpacts.length} downstream</small>
          </div>
          <div>
            <strong>{result.unknownImpacts.length}</strong>
            <span>Unknowns</span>
            <small>Explicit analysis gaps</small>
          </div>
          <div>
            <strong>{result.evidence.length}</strong>
            <span>Sources</span>
            <small>Revision-bound evidence</small>
          </div>
          {report.input.pullRequest ? (
            <div>
              <strong>
                {report.input.pullRequest.analysisBudget?.filesRetrieved ??
                  report.input.pullRequest.changedFiles.length}
              </strong>
              <span>Files read</span>
              <small>
                +{report.input.pullRequest.changedFiles.reduce(
                  (total, file) => total + file.additions,
                  0,
                )} · −{report.input.pullRequest.changedFiles.reduce(
                  (total, file) => total + file.deletions,
                  0,
                )}
              </small>
            </div>
          ) : null}
        </div>
      </section>
      <div className={`report-workspace ${view === "overview" ? "report-workspace--overview" : ""}`}>
        {view !== "overview" ? (
          <ReportNavigation reportId={currentReport.id} activeView={view} />
        ) : null}
        <div className="report-workspace__content">

          {view === "overview" && (
        <div className="report-overview">
          <div className="report-mode-switch" role="tablist" aria-label="Report view">
            <button
              id="report-briefing-tab"
              type="button"
              role="tab"
              aria-selected={reportMode === "briefing"}
              aria-controls="report-briefing-panel"
              className={reportMode === "briefing" ? "active" : ""}
              onClick={() => setReportMode("briefing")}
            >
              <Sparkles size={17} />
              <span><b>AI briefing</b><small>Plain-language explanation</small></span>
            </button>
            <button
              id="report-atlas-tab"
              type="button"
              role="tab"
              aria-selected={reportMode === "atlas"}
              aria-controls="report-atlas-panel"
              className={reportMode === "atlas" ? "active" : ""}
              onClick={() => setReportMode("atlas")}
            >
              <ShieldCheck size={17} />
              <span><b>Atlas report</b><small>Verified source analysis</small></span>
            </button>
          </div>

          {reportMode === "briefing" ? (
            <div
              id="report-briefing-panel"
              role="tabpanel"
              aria-labelledby="report-briefing-tab"
            >
              <PracticalAIExplanation
                state={currentReport.explanation}
                reportId={currentReport.id}
                result={result}
                retrying={retryingExplanation}
                retryError={explanationRetryError}
                onRetry={retryExplanation}
              />
            </div>
          ) : (
            <section
              id="report-atlas-panel"
              role="tabpanel"
              className="verified-report verified-report--overview"
              aria-labelledby="report-atlas-tab"
            >
              <header className="verified-report__intro">
                <span><ShieldCheck size={13} /> Source-backed analysis</span>
                <h2 id="verified-report-title">Verified Atlas report</h2>
                <p>
                  The deterministic conclusion tied to the indexed revision,
                  with uncertainty kept visible.
                </p>
              </header>
              <section className="executive-summary panel">
                <div className="summary-icon">
                  <AlertTriangle size={21} />
                </div>
                <div>
                  <span>
                    {result.status === "insufficient_evidence"
                      ? "Verified evidence status"
                      : "Verified Atlas analysis"}
                  </span>
                  <h2>{result.answer ?? result.executiveSummary}</h2>
                  <p>{result.executiveSummary}</p>
                  <p>
                    Derived from indexed source at revision{" "}
                    <code>{result.sourceRevision.slice(0, 12)}</code>. Atlas keeps
                    analysis gaps visible instead of filling them with assumptions.
                  </p>
                </div>
              </section>
              <details className="report-disclosure panel">
                <summary>
                  <span><FileText size={16} /><b>Documentation context</b></span>
                  <small>{result.documentationContext?.evidence.length ?? 0} linked records</small>
                </summary>
                <div className="documentation-context">
                  {result.documentationContext?.status === "available" ? (
                    <div className="documentation-context__list">
                      {result.documentationContext.evidence.map((item) => (
                        <a
                          href={item.url ?? "/app/sources"}
                          target={item.url ? "_blank" : undefined}
                          rel={item.url ? "noreferrer" : undefined}
                          key={item.id}
                          aria-label={`${item.url ? `Open ${item.title} in Notion` : "Open Notion source settings"} — ${notionEditorAttribution(item.lastEditedBy, item.lastEditedAt)}`}
                        >
                          <span>Notion · {Math.round(item.relevance * 100)}% relevant</span>
                          <h3>{item.title}</h3>
                          <p>{item.excerpt}</p>
                          <small>{notionEditorAttribution(item.lastEditedBy, item.lastEditedAt)}</small>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state">
                      <FileText size={18} />
                      <h3>No documentation context available</h3>
                      <p>Connect selected Notion pages to cite decisions and runbooks.</p>
                      <Link href="/app/sources">Review Notion sources</Link>
                    </div>
                  )}
                </div>
              </details>
            </section>
          )}

          <nav className="report-detail-links" aria-label="Explore report details">
            <span>Explore the evidence</span>
            <Link href={`/app/impact/${currentReport.id}/findings`}>
              <Network size={15} /><b>Findings</b><small>Blast radius</small><ArrowRight size={14} />
            </Link>
            <Link href={`/app/impact/${currentReport.id}/plan`}>
              <Check size={15} /><b>Plan</b><small>Next actions</small><ArrowRight size={14} />
            </Link>
            <Link href={`/app/impact/${currentReport.id}/evidence`}>
              <FileText size={15} /><b>Evidence</b><small>Source records</small><ArrowRight size={14} />
            </Link>
          </nav>
        </div>
      )}

          {view === "findings" && (
        <section className="report-detail-page" aria-labelledby="findings-title">
          <header className="report-detail-intro">
            <span>Impact map</span>
            <h2 id="findings-title">Findings</h2>
            <p>
              Review resolved modification anchors, direct impacts, downstream
              consumers, cross-repository paths, and the relationship evidence
              behind the reported blast radius.
            </p>
          </header>
          <main className="report-detail-main">
            <section className="report-section">
              <div className="report-section__heading">
                <div>
                  <span>01</span>
                  <h2>Resolved direct impact</h2>
                </div>
                <p>Indexed source matches</p>
              </div>
              <div className="impact-card-list">
                {result.directImpacts.map((item) => (
                  <ImpactFindingCard key={item.id} item={item} />
                ))}
                {!result.directImpacts.length && (
                  <div className="empty-state">
                    <AlertTriangle size={20} />
                    <h2>No direct anchor resolved</h2>
                    <p>Add an exact file path or symbol and rerun the analysis.</p>
                  </div>
                )}
              </div>
            </section>
            <section className="report-section">
              <div className="report-section__heading">
                <div>
                  <span>02</span>
                  <h2>Downstream and unknown</h2>
                </div>
                <p>Observed relationships and explicit gaps</p>
              </div>
              <div className="impact-card-list">
                {downstreamAndUnknown.map((item) => (
                  <ImpactFindingCard key={item.id} item={item} />
                ))}
              </div>
            </section>
            <section className="report-section">
              <div className="report-section__heading">
                <div>
                  <span>03</span>
                  <h2>Observed relationship path</h2>
                </div>
                <Link href="/app/graph">
                  Explore graph <ArrowRight size={14} />
                </Link>
              </div>
              {result.relationshipPath.length ? (
                <div className="path-diagram">
                  {result.relationshipPath.map((node, index) => (
                    <Fragment key={`${node.filePath}:${node.hop}:${index}`}>
                      <div>
                        {node.repository}
                        <small>{node.filePath}</small>
                      </div>
                      {index < result.relationshipPath.length - 1 && (
                        <ArrowRight size={17} />
                      )}
                    </Fragment>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <Network size={20} />
                  <h2>No observed path</h2>
                  <p>The report records this as an analysis gap.</p>
                </div>
              )}
            </section>
          </main>
        </section>
      )}

          {view === "plan" && (
        <section className="report-detail-page" aria-labelledby="plan-title">
          <header className="report-detail-intro">
            <span>Execution workspace</span>
            <h2 id="plan-title">Implementation and verification plan</h2>
            <p>
              Work through Atlas&apos;s deterministic recommendations and checks,
              with the source-backed analysis kept separate from AI prose.
            </p>
          </header>
          <div className="verified-plan-grid">
            <section className="report-section panel">
              <div className="report-section__heading">
                <div>
                  <span>Atlas</span>
                  <h2>Recommended next steps</h2>
                </div>
              </div>
              <div className="check-list">
                {(result.recommendations ?? []).map((item) => (
                  <label key={item}>
                    <input type="checkbox" /> <span>{item}</span>
                  </label>
                ))}
              </div>
            </section>
            <section className="report-section panel">
              <div className="report-section__heading">
                <div>
                  <span>Atlas</span>
                  <h2>Verification plan</h2>
                </div>
              </div>
              <div className="check-list">
                {result.verificationPlan.map((item) => (
                  <label key={item}>
                    <input type="checkbox" /> <span>{item}</span>
                  </label>
                ))}
              </div>
            </section>
          </div>
        </section>
      )}

          {view === "evidence" && (
        <section className="report-detail-page" aria-labelledby="evidence-title">
          <header className="report-detail-intro">
            <span>Source records</span>
            <h2 id="evidence-title">Evidence</h2>
            <p>
              Browse the indexed sources behind both the Atlas report and the AI
              briefing. Open an item only when you need its excerpt.
            </p>
          </header>
          <div className="evidence-workspace">
            <section className="panel evidence-workspace__sources">
              <div className="panel-heading">
                <div>
                  <span>{result.evidence.length} indexed records</span>
                  <h2>Supporting sources</h2>
                </div>
                <FileText size={17} />
              </div>
              <div className="evidence-list evidence-list--workspace">
                {result.evidence.map((item) => (
                  <details
                    key={item.id}
                    id={evidenceDomId(item.id)}
                    className={`evidence-row ${
                      item.provenance === "historical_relationship"
                        ? "evidence-row--violet"
                        : item.provenance !== "indexed_source_chunk"
                          ? "evidence-row--orange"
                          : "evidence-row--cyan"
                    }`}
                  >
                    <summary>
                      <span>{item.provenance.replaceAll("_", " ")}</span>
                      <b>
                        {item.filePath}
                        {item.lineStart ? `:${item.lineStart}` : ""}
                      </b>
                      <ArrowRight size={14} />
                    </summary>
                    <p>{item.excerpt}</p>
                  </details>
                ))}
                {!result.evidence.length && (
                  <div className="empty-state">
                    <FileText size={18} />
                    <p>No supporting citation was resolved.</p>
                  </div>
                )}
              </div>
              {result.documentationContext?.evidence.length ? (
                <div className="documentation-evidence">
                  <span>
                    {result.documentationContext.evidence.length} Notion records
                  </span>
                  <h3>Decisions and documentation</h3>
                  {result.documentationContext.evidence.map((item) => (
                    <a
                      href={item.url ?? "/app/sources"}
                      target={item.url ? "_blank" : undefined}
                      rel={item.url ? "noreferrer" : undefined}
                      key={item.id}
                      aria-label={`${item.url ? `Open ${item.title} in Notion` : "Open Notion source settings"} — ${notionEditorAttribution(item.lastEditedBy, item.lastEditedAt)}`}
                    >
                      <b>{item.title}</b>
                      <small>{item.sourceRevision.slice(0, 12)} · {notionEditorAttribution(item.lastEditedBy, item.lastEditedAt)}</small>
                    </a>
                  ))}
                </div>
              ) : null}
            </section>
            <aside className="panel evidence-workspace__boundaries">
              <span>Analysis boundaries</span>
              <h2>{result.limitations.length} recorded limitations</h2>
              {result.limitations.map((limitation) => (
                <p key={limitation}>{limitation}</p>
              ))}
            </aside>
          </div>
        </section>
          )}
        </div>
      </div>
      <details className="feedback-panel pilot-feedback panel">
        <summary>
          <span>Report feedback</span>
          <b>Help improve Atlas</b>
        </summary>
        <div className="pilot-feedback__body">
          <p>
            Confirm useful findings or record anything Atlas missed. This
            feedback stays scoped to your workspace.
          </p>
        <div className="pilot-feedback__findings">
          {[
            ...result.directImpacts,
            ...result.downstreamImpacts,
          ].map((finding) => (
            <label key={finding.id}>
              <input
                type="checkbox"
                checked={confirmedFindingIds.includes(finding.id)}
                onChange={(event) =>
                  setConfirmedFindingIds((current) =>
                    event.target.checked
                      ? [...new Set([...current, finding.id])]
                      : current.filter((id) => id !== finding.id),
                  )
                }
              />
              <span>Confirm finding: {finding.title}</span>
            </label>
          ))}
        </div>
        <label>
          <span>What impact did Atlas miss?</span>
          <textarea
            value={missedImpact}
            maxLength={2000}
            onChange={(event) => setMissedImpact(event.target.value)}
          />
        </label>
        <label>
          <span>Additional notes</span>
          <textarea
            value={feedbackComment}
            maxLength={2000}
            onChange={(event) => setFeedbackComment(event.target.value)}
          />
        </label>
        <div>
          <button
            className={feedbackRating === "useful" ? "active" : ""}
            disabled={savingFeedback}
            onClick={() => submitFeedback("useful")}
          >
            <ThumbsUp size={14} /> Useful
          </button>
          <button
            className={feedbackRating === "not_useful" ? "active" : ""}
            disabled={savingFeedback}
            onClick={() => submitFeedback("not_useful")}
          >
            <ThumbsDown size={14} /> Not useful
          </button>
        </div>
          {feedbackStatus && <p role="status">{feedbackStatus}</p>}
        </div>
      </details>
    </div>
  );
}
