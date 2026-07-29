"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Box,
  Check,
  Code2,
  FileText,
  GitBranch,
  GitPullRequest,
  Link2,
  Network,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { PageHeader } from "@/components/app/shared";
import { ConfidenceBadge } from "@/components/brand";
import type {
  AtlasImpactCitation,
  AtlasImpactExplanationState,
  AtlasImpactFinding,
  AtlasImpactReport,
  AtlasRepository,
  AtlasWorkspace,
} from "@/lib/api-types";

function ImpactFindingCard({ item }: { item: AtlasImpactFinding }) {
  const evidence = item.filePath
    ? `${item.repository}/${item.filePath}`
    : item.repository;
  const confidence =
    item.provenance === "typescript_static_import" ? "observed" : "inferred";
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

const EXPLANATION_FALLBACK =
  "Enhanced explanation unavailable. Showing the verified Atlas analysis.";

function evidenceDomId(evidenceId: string) {
  return `evidence-${evidenceId.replace(/[^A-Za-z0-9_-]/g, "-")}`;
}

function CitationLinks({
  evidenceIds,
  evidenceById,
}: {
  evidenceIds: string[];
  evidenceById: Map<string, AtlasImpactCitation>;
}) {
  const citations = evidenceIds
    .map((id) => evidenceById.get(id))
    .filter((citation): citation is AtlasImpactCitation => Boolean(citation));

  if (!citations.length) return null;

  return (
    <span className="explanation-citations" aria-label="Supporting citations">
      {citations.map((citation) => (
        <a
          href={`#${evidenceDomId(citation.id)}`}
          key={citation.id}
          aria-label={`View evidence from ${citation.filePath}${
            citation.lineStart ? ` line ${citation.lineStart}` : ""
          }`}
        >
          <Link2 size={12} />
          {citation.filePath}
          {citation.lineStart ? `:${citation.lineStart}` : ""}
        </a>
      ))}
    </span>
  );
}

function ExplanationFallback({
  explanation,
  retrying,
  retryError,
  onRetry,
}: {
  explanation: AtlasImpactExplanationState | null | undefined;
  retrying: boolean;
  retryError: string;
  onRetry: () => void;
}) {
  const canRetry = !explanation || explanation.status === "failed";
  const failure =
    explanation?.status === "failed" && explanation.failureCode
      ? explanation.failureCode.replaceAll("_", " ")
      : null;

  return (
    <section className="explanation-fallback panel" aria-live="polite">
      <div>
        <span className="explanation-label">
          <Sparkles size={14} /> AI explanation
        </span>
        <h2>{EXPLANATION_FALLBACK}</h2>
        <p>
          The deterministic findings, evidence, limitations, and verification
          plan below remain available.
          {failure ? ` Generation stopped because of ${failure}.` : ""}
        </p>
        {retryError && (
          <p className="explanation-retry-error" role="alert">
            {retryError}
          </p>
        )}
      </div>
      {canRetry && (
        <button
          className="button button--ghost"
          type="button"
          onClick={onRetry}
          disabled={retrying}
        >
          <RefreshCw className={retrying ? "spin" : ""} size={14} />
          {retrying ? "Retrying…" : "Retry explanation"}
        </button>
      )}
    </section>
  );
}

function AIExplanation({
  state,
  evidence,
  limitations,
  retrying,
  retryError,
  onRetry,
}: {
  state: AtlasImpactExplanationState | null | undefined;
  evidence: AtlasImpactCitation[];
  limitations: string[];
  retrying: boolean;
  retryError: string;
  onRetry: () => void;
}) {
  if (state?.status === "pending") {
    return (
      <section className="explanation-fallback panel" aria-live="polite">
        <div>
          <span className="explanation-label">
            <Sparkles size={14} /> AI explanation
          </span>
          <h2>Enhanced explanation is being generated.</h2>
          <p>
            The verified Atlas analysis is ready below while generation
            completes.
          </p>
        </div>
        <RefreshCw className="spin" size={18} aria-hidden="true" />
      </section>
    );
  }

  if (state?.status !== "completed") {
    return (
      <ExplanationFallback
        explanation={state}
        retrying={retrying}
        retryError={retryError}
        onRetry={onRetry}
      />
    );
  }

  const { explanation, metadata } = state;
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));

  return (
    <section className="ai-explanation panel" aria-labelledby="ai-explanation-title">
      <header className="ai-explanation__header">
        <div>
          <span className="explanation-label">
            <Sparkles size={14} /> AI explanation
          </span>
          <h2 id="ai-explanation-title">{explanation.answer}</h2>
          <p>{explanation.executiveSummary}</p>
        </div>
        {metadata?.model && (
          <span className="explanation-model">
            {metadata.provider} · {metadata.model}
          </span>
        )}
      </header>
      <p className="explanation-boundary">
        Generated from Atlas&apos;s verified evidence packet. The model did not
        scan the repository.
      </p>

      <div className="ai-explanation__section">
        <h3>Evidence-grounded claims</h3>
        <div className="explanation-claims">
          {explanation.claims.map((claim, index) => (
            <article key={`${claim.text}:${index}`}>
              <p>{claim.text}</p>
              <CitationLinks
                evidenceIds={claim.evidenceIds}
                evidenceById={evidenceById}
              />
            </article>
          ))}
        </div>
      </div>

      <div className="explanation-guidance-grid">
        <section className="ai-explanation__section">
          <h3>Implementation guidance</h3>
          <ol className="explanation-steps">
            {explanation.implementationSteps.map((step, index) => (
              <li key={`${step.title}:${index}`}>
                <div>
                  <b>{step.title}</b>
                  <p>{step.detail}</p>
                  <CitationLinks
                    evidenceIds={step.evidenceIds}
                    evidenceById={evidenceById}
                  />
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section className="ai-explanation__section">
          <h3>Verification guidance</h3>
          <ol className="explanation-steps">
            {explanation.verificationSteps.map((step, index) => (
              <li key={`${step.text}:${index}`}>
                <div>
                  <p>{step.text}</p>
                  <CitationLinks
                    evidenceIds={step.evidenceIds}
                    evidenceById={evidenceById}
                  />
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <div className="explanation-unknowns">
        <section>
          <h3>Remaining questions</h3>
          {explanation.remainingQuestions.length ? (
            <ul>
              {explanation.remainingQuestions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          ) : (
            <p>No additional questions were generated.</p>
          )}
        </section>
        <section>
          <h3>Verified limitations</h3>
          {limitations.length ? (
            <ul>
              {limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
          ) : (
            <p>No deterministic limitations were recorded.</p>
          )}
        </section>
      </div>
    </section>
  );
}

export function ImpactNewPage({
  repositories,
  workspace,
}: {
  repositories: AtlasRepository[];
  workspace: AtlasWorkspace;
}) {
  const router = useRouter();
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
  const steps = [
    "Resolve indexed entities",
    "Traverse observed imports",
    "Rank source evidence",
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
        eyebrow="Change intelligence"
        title="Analyze a change"
        detail="Describe what you plan to change. Atlas resolves indexed code entities, follows observed relationships, and keeps unknowns explicit."
      />
      {error && (
        <p className="action-notice action-notice--error" role="alert">
          {error}
        </p>
      )}
      <div className="analysis-layout">
        <section className="analysis-form panel">
          <div className="segmented" role="tablist">
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
          <div className="form-footer">
            <p>
              <ShieldCheck size={15} /> Analysis is deterministic,
              evidence-backed, and read-only.
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

export function ImpactReportPage({ report }: { report: AtlasImpactReport }) {
  const [feedback, setFeedback] = useState("");
  const [currentReport, setCurrentReport] = useState(report);
  const [retryingExplanation, setRetryingExplanation] = useState(false);
  const [explanationRetryError, setExplanationRetryError] = useState("");
  const { result } = currentReport;
  const downstreamAndUnknown = [
    ...result.downstreamImpacts,
    ...result.unknownImpacts,
  ];
  const generatedAt = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(result.generatedAt));

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

  return (
    <>
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
      {report.input.pullRequest && (
        <div className="pr-detail panel">
          <span>GitHub pull request</span>
          <h2>
            {result.repository.owner}/{result.repository.name} #
            {report.input.pullRequest.number}
          </h2>
          <p>
            {report.input.pullRequest.analysisBudget?.filesRetrieved ??
              report.input.pullRequest.changedFiles.length}{" "}
            of{" "}
            {report.input.pullRequest.analysisBudget?.totalChangedFiles ??
              report.input.pullRequest.changedFiles.length}{" "}
            files retrieved ·{" "}
            {report.input.pullRequest.changedFiles.reduce(
              (total, file) => total + file.additions,
              0,
            )}{" "}
            additions ·{" "}
            {report.input.pullRequest.changedFiles.reduce(
              (total, file) => total + file.deletions,
              0,
            )}{" "}
            deletions · {report.input.pullRequest.author}
          </p>
        </div>
      )}
      <section className="report-hero">
        <div>
          <p className="eyebrow">
            <Sparkles size={14} /> Live impact report
          </p>
          <h1>{result.title}</h1>
          <p>
            {result.repository.owner}/{result.repository.name} ·{" "}
            {result.sourceRevision.slice(0, 12)} ·{" "}
            {result.scope === "workspace"
              ? "Entire workspace"
              : "Current repository"}
          </p>
        </div>
        <div className="risk-score">
          <span>
            {result.risk.score === null
              ? "Change risk · not scored"
              : `Change risk · ${result.risk.score}/100`}
          </span>
          <strong>{result.risk.level}</strong>
          <p>{result.risk.reasons.join(" · ")}</p>
        </div>
      </section>
      <AIExplanation
        state={currentReport.explanation}
        evidence={result.evidence}
        limitations={result.limitations}
        retrying={retryingExplanation}
        retryError={explanationRetryError}
        onRetry={retryExplanation}
      />
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
            This report is derived from indexed source at revision{" "}
            <code>{result.sourceRevision.slice(0, 12)}</code>. Analysis gaps
            remain visible instead of being filled with generated assumptions.
          </p>
        </div>
      </section>
      <div className="report-grid">
        <main>
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
          <section className="report-section">
            <div className="report-section__heading">
              <div>
                <span>04</span>
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
          <section className="report-section">
            <div className="report-section__heading">
              <div>
                <span>05</span>
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
        </main>
        <aside className="report-aside">
          <div className="panel sticky-panel">
            <div className="panel-heading">
              <div>
                <span>Supporting context</span>
                <h2>Evidence</h2>
              </div>
              <FileText size={17} />
            </div>
            <div className="evidence-list">
              {result.evidence.map((item) => (
                <article
                  key={item.id}
                  id={evidenceDomId(item.id)}
                  tabIndex={-1}
                  className={`evidence-row ${
                    item.provenance === "typescript_static_import"
                      ? "evidence-row--orange"
                      : "evidence-row--cyan"
                  }`}
                >
                  <span>{item.provenance.replaceAll("_", " ")}</span>
                  <b>
                    {item.filePath}
                    {item.lineStart ? `:${item.lineStart}` : ""}
                  </b>
                  <p>{item.excerpt}</p>
                  <ArrowRight size={14} />
                </article>
              ))}
              {!result.evidence.length && (
                <div className="empty-state">
                  <FileText size={18} />
                  <p>No supporting citation was resolved.</p>
                </div>
              )}
            </div>
          </div>
          <div className="panel owner-panel">
            <span>Analysis boundaries</span>
            <b>{result.limitations.length} recorded limitations</b>
            {result.limitations.map((limitation) => (
              <p key={limitation}>{limitation}</p>
            ))}
          </div>
          <div className="feedback-panel">
            <span>Was this analysis useful?</span>
            <div>
              {["Correct", "Missing", "Uncertain"].map((item) => (
                <button
                  className={feedback === item ? "active" : ""}
                  onClick={() => setFeedback(item)}
                  key={item}
                >
                  {item}
                </button>
              ))}
            </div>
            {feedback && (
              <p>Thanks—“{feedback}” feedback is saved locally.</p>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
