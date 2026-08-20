"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import {
  ArrowRight,
  BookMarked,
  BookOpenText,
  Check,
  Clock3,
  ExternalLink,
  FileDiff,
  History,
  ListChecks,
  MessageCircleQuestion,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type {
  AtlasNotionCatchUpBriefing,
  AtlasNotionCatchUpSnapshot,
  AtlasNotionContextCitation,
  AtlasNotionDocumentReview,
  AtlasNotionQuestionAnswer,
  AtlasNotionReviewDocumentsResponse,
  AtlasNotionReviewFinding,
  AtlasWorkspace,
} from "@/lib/api-types";

type ContextView = "catch-up" | "ask" | "review";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function citationMap(citations: AtlasNotionContextCitation[]) {
  return new Map(citations.map((citation) => [citation.id, citation]));
}

async function postContext<T>(
  action: "briefings" | "acknowledge" | "questions" | "reviews",
  body: Record<string, string>,
): Promise<T> {
  const response = await fetch(`/api/notion/context/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => null)) as
    | (T & { message?: string })
    | null;
  if (!response.ok || !result) {
    throw new Error(result?.message ?? "Notion context is temporarily unavailable.");
  }
  return result;
}

function ReviewFindings({
  title,
  description,
  findings,
  citations,
}: {
  title: string;
  description: string;
  findings: AtlasNotionReviewFinding[];
  citations: Map<string, AtlasNotionContextCitation>;
}) {
  return (
    <section className="notion-review-section">
      <header>
        <div>
          <span>{description}</span>
          <h3>{title}</h3>
        </div>
        <b>{findings.length}</b>
      </header>
      {findings.length ? (
        <div>
          {findings.map((finding, index) => (
            <article key={`${title}-${index}-${finding.text}`}>
              <p>{finding.text}</p>
              <CitationLinks ids={finding.citationIds} citations={citations} />
            </article>
          ))}
        </div>
      ) : (
        <p className="notion-review-section__empty">
          No evidence-grounded items were found in this category.
        </p>
      )}
    </section>
  );
}

function CitationLinks({
  ids,
  citations,
}: {
  ids: string[];
  citations: Map<string, AtlasNotionContextCitation>;
}) {
  return (
    <div className="context-citations" aria-label="Notion citations">
      {ids.map((id, index) => {
        const citation = citations.get(id);
        if (!citation) return null;
        const label = `${index + 1}. ${citation.title}`;
        return citation.url ? (
          <a href={citation.url} target="_blank" rel="noreferrer" key={id}>
            <BookMarked size={12} /> {label} <ExternalLink size={11} />
          </a>
        ) : (
          <span key={id}><BookMarked size={12} /> {label}</span>
        );
      })}
    </div>
  );
}

export function NotionContextPage({
  workspace,
  initialSnapshot,
  initialReviewDocuments = null,
}: {
  workspace: AtlasWorkspace;
  initialSnapshot: AtlasNotionCatchUpSnapshot | null;
  initialReviewDocuments?: AtlasNotionReviewDocumentsResponse | null;
}) {
  const [view, setView] = useState<ContextView>("catch-up");
  const [briefing, setBriefing] = useState<AtlasNotionCatchUpBriefing | null>(null);
  const [answer, setAnswer] = useState<AtlasNotionQuestionAnswer | null>(null);
  const [question, setQuestion] = useState("");
  const [loadingBriefing, setLoadingBriefing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [selectedPreviousVersionId, setSelectedPreviousVersionId] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [review, setReview] = useState<AtlasNotionDocumentReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const snapshot = briefing?.snapshot ?? initialSnapshot;
  const snapshotCitations = useMemo(
    () => citationMap(snapshot?.citations ?? []),
    [snapshot?.citations],
  );
  const answerCitations = useMemo(
    () => citationMap(answer?.citations ?? []),
    [answer?.citations],
  );
  const reviewableDocuments = useMemo(
    () => initialReviewDocuments?.documents.filter((document) => document.reviewable) ?? [],
    [initialReviewDocuments],
  );
  const selectedDocument = useMemo(
    () =>
      reviewableDocuments.find(
        (document) => document.documentId === selectedDocumentId,
      ) ?? reviewableDocuments[0] ?? null,
    [reviewableDocuments, selectedDocumentId],
  );
  const previousRevisions = useMemo(
    () => selectedDocument?.revisions.filter((revision) => !revision.isCurrent) ?? [],
    [selectedDocument],
  );
  const selectedPreviousVersion =
    previousRevisions.find(
      (revision) => revision.id === selectedPreviousVersionId,
    ) ?? previousRevisions[0] ?? null;
  const reviewCitations = useMemo(
    () => citationMap(review?.citations ?? []),
    [review?.citations],
  );

  async function generateBriefing() {
    if (!snapshot) return;
    setLoadingBriefing(true);
    setError(null);
    try {
      setBriefing(
        await postContext<AtlasNotionCatchUpBriefing>("briefings", {
          workspaceId: workspace.id,
          snapshotFrom: snapshot.range.from,
          snapshotThrough: snapshot.range.through,
        }),
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Briefing failed.");
    } finally {
      setLoadingBriefing(false);
    }
  }

  async function markCaughtUp() {
    if (!snapshot) return;
    setAcknowledging(true);
    setError(null);
    try {
      await postContext<{ acknowledgedThrough: string; advanced: boolean }>(
        "acknowledge",
        {
          workspaceId: workspace.id,
          acknowledgedThrough: snapshot.range.through,
        },
      );
      setAcknowledged(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Acknowledgement failed.");
    } finally {
      setAcknowledging(false);
    }
  }

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (question.trim().length < 2) return;
    setAsking(true);
    setError(null);
    try {
      setAnswer(
        await postContext<AtlasNotionQuestionAnswer>("questions", {
          workspaceId: workspace.id,
          query: question.trim(),
        }),
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Question failed.");
    } finally {
      setAsking(false);
    }
  }

  async function runDocumentReview() {
    if (!selectedDocument || !selectedPreviousVersion) return;
    setReviewing(true);
    setError(null);
    setReview(null);
    try {
      setReview(
        await postContext<AtlasNotionDocumentReview>("reviews", {
          workspaceId: workspace.id,
          documentId: selectedDocument.documentId,
          previousVersionId: selectedPreviousVersion.id,
        }),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Review failed.",
      );
    } finally {
      setReviewing(false);
    }
  }

  return (
    <div className="notion-context-page">
      <header className="context-hero">
        <div>
          <span><i /> Notion context · durable team memory</span>
          <h1>Return to the decisions that moved while you were away.</h1>
          <p>Catch up on selected Notion pages from your personal read position, then ask cited questions without mixing repository evidence into the answer.</p>
        </div>
        <div className="context-hero__seal" aria-hidden="true">
          <BookOpenText size={25} />
          <span>記憶</span>
          <small>workspace memory</small>
        </div>
      </header>

      <nav className="context-view-tabs" aria-label="Notion context views">
        <button className={view === "catch-up" ? "active" : ""} onClick={() => setView("catch-up")} aria-pressed={view === "catch-up"} aria-label="Catch up — unread Notion changes">
          <Clock3 size={15} /><span><b>Catch up</b><small>Your unread document changes</small></span>
        </button>
        <button className={view === "ask" ? "active" : ""} onClick={() => setView("ask")} aria-pressed={view === "ask"} aria-label="Ask — answers from Notion only">
          <MessageCircleQuestion size={15} /><span><b>Ask</b><small>Answers from Notion only</small></span>
        </button>
        <button className={view === "review" ? "active" : ""} onClick={() => setView("review")} aria-pressed={view === "review"} aria-label="Review — compare retained Notion revisions">
          <FileDiff size={15} /><span><b>Review</b><small>Compare retained revisions</small></span>
        </button>
      </nav>

      {error && <div className="context-alert" role="alert"><ShieldCheck size={16} />{error}</div>}

      {view !== "review" && !snapshot ? (
        <section className="context-empty panel">
          <BookOpenText size={28} />
          <h2>Notion context could not be loaded.</h2>
          <p>Confirm that the backend is running, then retry this page.</p>
        </section>
      ) : view === "review" && !initialReviewDocuments ? (
        <section className="context-empty panel">
          <FileDiff size={28} />
          <h2>Document revisions could not be loaded.</h2>
          <p>Confirm that the backend is running, then retry this page.</p>
        </section>
      ) : (view === "review" ? initialReviewDocuments?.availability : snapshot?.availability) !== "ready" ? (
        <section className="context-empty panel">
          <div className="context-empty__mark">N</div>
          <h2>{(view === "review" ? initialReviewDocuments?.availability : snapshot?.availability) === "not_connected" ? "Connect Notion to begin a team memory." : "Choose the Notion sources Atlas may remember."}</h2>
          <p>Sources remains the place for OAuth, page selection, and synchronization. This page only reads workspace-approved, synchronized material.</p>
          <Link className="button button--primary" href="/app/sources">Manage Notion sources <ArrowRight size={14} /></Link>
        </section>
      ) : view === "catch-up" && snapshot ? (
        <div className="catch-up-layout">
          <main>
            <section className="catch-up-summary panel">
              <div className="catch-up-summary__intro">
                <span>{snapshot.range.firstVisit ? "Your first seven-day briefing" : "Since your last acknowledgement"}</span>
                <h2>{briefing?.headline ?? (snapshot.counts.documents ? `${snapshot.counts.documents} documents changed` : "Your Notion context is quiet")}</h2>
                <p>{briefing?.summary ?? (snapshot.counts.documents ? `${snapshot.counts.newDocuments} new and ${snapshot.counts.changedDocuments} changed documents are ready to review.` : "No selected synchronized pages changed in this personal catch-up window.")}</p>
              </div>
              <div className="catch-up-summary__metrics">
                <article><strong>{snapshot.counts.newDocuments}</strong><span>new</span></article>
                <article><strong>{snapshot.counts.changedDocuments}</strong><span>changed</span></article>
                <article><strong>{snapshot.citations.length}</strong><span>citations</span></article>
              </div>
              {snapshot.counts.documents > 0 && !briefing && (
                <button className="button button--primary" onClick={() => void generateBriefing()} disabled={loadingBriefing}>
                  {loadingBriefing ? <RefreshCw className="spin" size={14} /> : <Sparkles size={14} />}
                  {loadingBriefing ? "Building briefing…" : "Create cited briefing"}
                </button>
              )}
              {briefing && (
                <div className="catch-up-briefing">
                  <div><Sparkles size={15} /><span>{briefing.status === "generated" ? "Grounded briefing" : "Deterministic briefing"}{briefing.cached ? " · reused" : ""}</span></div>
                  {briefing.highlights.map((highlight, index) => (
                    <article key={`${highlight.text}-${index}`}>
                      <p>{highlight.text}</p>
                      <CitationLinks ids={highlight.citationIds} citations={snapshotCitations} />
                    </article>
                  ))}
                  {briefing.limitations.map((limitation) => <small key={limitation}>{limitation}</small>)}
                </div>
              )}
            </section>

            <section className="context-document-list">
              <div className="context-section-heading"><div><span>Change ledger</span><h2>Documents in this catch-up</h2></div><small>Revision-level evidence</small></div>
              {snapshot.documents.map((document) => (
                <article className="context-document panel" key={document.documentId}>
                  <header>
                    <i className={document.changeType}>{document.changeType}</i>
                    <div><h3>{document.title}</h3><p>{document.changedSections.length ? `${document.changedSections.length} changed ${document.changedSections.length === 1 ? "section" : "sections"}` : "Revision changed"} · {formatDate(document.changedAt)}</p></div>
                    {document.url && <a href={document.url} target="_blank" rel="noreferrer" aria-label={`Open ${document.title} in Notion`}><ExternalLink size={15} /></a>}
                  </header>
                  <div className="context-section-diffs">
                    {document.changedSections.slice(0, 4).map((section) => (
                      <div key={`${section.heading}-${section.changeType}`}>
                        <span>{section.changeType}</span><b>{section.heading}</b><p>{section.excerpt || "No text excerpt was retained for this section."}</p>
                      </div>
                    ))}
                    {!document.changedSections.length && <p>Atlas retained the new revision but could not isolate a Markdown section change.</p>}
                  </div>
                  <footer><code>{document.currentRevision.slice(0, 16)}</code>{document.baselineUnavailable && <span>Earlier retained baseline unavailable</span>}<CitationLinks ids={document.citationIds} citations={snapshotCitations} /></footer>
                </article>
              ))}
              {!snapshot.documents.length && <div className="context-zero panel"><Check size={22} /><div><h3>Nothing new to read.</h3><p>Your cursor is current for every selected, synchronized Notion source.</p></div></div>}
            </section>
          </main>

          <aside className="catch-up-aside">
            <section className="panel read-position-card">
              <span>Personal read position</span>
              <h2>{acknowledged ? "Caught up" : "Waiting for you"}</h2>
              <dl><div><dt>From</dt><dd>{formatDate(snapshot.range.from)}</dd></div><div><dt>Through</dt><dd>{formatDate(snapshot.range.through)}</dd></div></dl>
              <p>Opening this page never advances your cursor. Mark it only after you have reviewed this snapshot.</p>
              <button className="button button--primary" onClick={() => void markCaughtUp()} disabled={acknowledging || acknowledged}>
                {acknowledged ? <Check size={14} /> : <BookMarked size={14} />}
                {acknowledged ? "Marked caught up" : acknowledging ? "Saving position…" : "Mark caught up"}
              </button>
            </section>
            <section className="context-boundary">
              <ShieldCheck size={16} /><div><b>Notion-only boundary</b><p>No GitHub chunks, graph edges, impact scores, or repository findings enter this workflow.</p></div>
            </section>
          </aside>
        </div>
      ) : view === "ask" ? (
        <div className="notion-ask-layout">
          <main className="panel notion-ask-workspace">
            <div className="notion-ask-intro"><span>Grounded workspace question</span><h2>Ask the memory your team chose to keep.</h2><p>Atlas retrieves only synchronized Notion chunks and returns original-resource citations. If grounding fails, you receive ranked excerpts instead of an invented answer.</p></div>
            <form onSubmit={(event) => void submitQuestion(event)}>
              <label htmlFor="notion-question">Your question</label>
              <div><MessageCircleQuestion size={18} /><textarea id="notion-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What did we decide about session rotation, and why?" maxLength={500} /><button className="button button--primary" disabled={asking || question.trim().length < 2}>{asking ? <RefreshCw className="spin" size={14} /> : <ArrowRight size={14} />}{asking ? "Searching memory…" : "Ask Notion"}</button></div>
            </form>
            {answer && (
              <section className="notion-answer" aria-live="polite">
                <header><Sparkles size={16} /><div><span>{answer.status === "generated" ? "Grounded answer" : "Evidence fallback"}</span><small>{answer.lowConfidence ? "Low confidence · verify the excerpts" : `${answer.citationIds.length} cited sources`}</small></div></header>
                <p>{answer.answer}</p>
                <CitationLinks ids={answer.citationIds} citations={answerCitations} />
                {answer.suggestedQuestions.length > 0 && <div className="suggested-questions"><span>Continue with</span>{answer.suggestedQuestions.map((item) => <button key={item} onClick={() => setQuestion(item)}>{item}</button>)}</div>}
              </section>
            )}
          </main>
          <aside className="panel notion-ask-guide">
            <BookOpenText size={21} />
            <span>Useful prompts</span>
            {["Which decisions changed this week?", "What guidance exists for incident ownership?", "Which ADR explains our authentication boundary?"].map((prompt) => <button key={prompt} onClick={() => setQuestion(prompt)}>{prompt}<ArrowRight size={12} /></button>)}
            <div><ShieldCheck size={14} /><p>Synchronized text is treated as untrusted evidence. Instruction-like content and uncited model claims are rejected.</p></div>
          </aside>
        </div>
      ) : (
        <div className="notion-review-layout">
          <main>
            <section className="panel notion-review-setup">
              <div className="notion-review-setup__intro">
                <span>On-demand document review</span>
                <h2>See how a decision changed—not merely that it changed.</h2>
                <p>Select a synchronized page and a retained earlier revision. Atlas compares them only when you ask, then checks the result against other selected Notion documents without touching your engineering graph or impact score.</p>
              </div>

              {reviewableDocuments.length ? (
                <div className="notion-review-controls">
                  <label>
                    <span>Document</span>
                    <select
                      value={selectedDocument?.documentId ?? ""}
                      onChange={(event) => {
                        setSelectedDocumentId(event.target.value);
                        setSelectedPreviousVersionId("");
                        setReview(null);
                      }}
                    >
                      {reviewableDocuments.map((document) => (
                        <option key={document.documentId} value={document.documentId}>
                          {document.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="notion-review-revision-flow" aria-label="Revision comparison">
                    <label>
                      <span>Compare from</span>
                      <select
                        value={selectedPreviousVersion?.id ?? ""}
                        onChange={(event) => {
                          setSelectedPreviousVersionId(event.target.value);
                          setReview(null);
                        }}
                      >
                        {previousRevisions.map((revision) => (
                          <option key={revision.id} value={revision.id}>
                            {formatDate(revision.capturedAt)} · {revision.sourceRevision.slice(0, 14)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <ArrowRight size={18} aria-hidden="true" />
                    <div>
                      <span>To current</span>
                      <strong>{selectedDocument?.currentRevision.slice(0, 18)}</strong>
                      <small>{selectedDocument?.revisions[0] ? formatDate(selectedDocument.revisions[0].capturedAt) : "Latest sync"}</small>
                    </div>
                  </div>
                  <button
                    className="button button--primary"
                    onClick={() => void runDocumentReview()}
                    disabled={
                      reviewing ||
                      !selectedPreviousVersion ||
                      workspace.role === "viewer"
                    }
                  >
                    {reviewing ? <RefreshCw className="spin" size={14} /> : <FileDiff size={14} />}
                    {reviewing ? "Reviewing revisions…" : "Review selected revisions"}
                  </button>
                  {workspace.role === "viewer" && (
                    <small className="notion-review-permission">
                      Viewers may read saved reviews; a member, admin, or owner must request a new one.
                    </small>
                  )}
                </div>
              ) : (
                <div className="notion-review-no-history">
                  <History size={21} />
                  <div>
                    <h3>No document has two retained revisions yet.</h3>
                    <p>After a selected page changes and synchronizes again, its earlier version will become available here.</p>
                  </div>
                  <Link href="/app/sources">Check synchronization <ArrowRight size={13} /></Link>
                </div>
              )}
            </section>

            {review && (
              <section className="notion-review-report" aria-live="polite">
                <header className="panel">
                  <div className="notion-review-report__mark"><ListChecks size={22} /></div>
                  <div>
                    <span>{review.status === "generated" ? "Grounded document review" : "Deterministic revision review"}{review.cached ? " · reused" : ""}</span>
                    <h2>{review.document.title}</h2>
                    <p>{review.document.previousRevision.slice(0, 16)} <ArrowRight size={11} /> {review.document.currentRevision.slice(0, 16)} · reviewed {formatDate(review.createdAt)}</p>
                  </div>
                  {review.document.url && (
                    <a href={review.document.url} target="_blank" rel="noreferrer">Open in Notion <ExternalLink size={13} /></a>
                  )}
                </header>
                <div className="notion-review-grid">
                  <ReviewFindings title="What changed" description="Revision delta" findings={review.whatChanged} citations={reviewCitations} />
                  <ReviewFindings title="Decisions added" description="New commitments" findings={review.decisionsAdded} citations={reviewCitations} />
                  <ReviewFindings title="Decisions removed" description="Retired commitments" findings={review.decisionsRemoved} citations={reviewCitations} />
                  <ReviewFindings title="Decisions modified" description="Changed guidance" findings={review.decisionsModified} citations={reviewCitations} />
                  <ReviewFindings title="Contradictions" description="Across selected Notion sources" findings={review.contradictions} citations={reviewCitations} />
                  <ReviewFindings title="Potentially superseded" description="Guidance to verify" findings={review.potentiallySuperseded} citations={reviewCitations} />
                  <ReviewFindings title="Missing rationale" description="Unexplained choices" findings={review.missingRationale} citations={reviewCitations} />
                  <ReviewFindings title="Unresolved questions" description="Open ends" findings={review.unresolvedQuestions} citations={reviewCitations} />
                </div>
                {review.limitations.length > 0 && (
                  <div className="context-boundary notion-review-limitations">
                    <ShieldCheck size={16} />
                    <div><b>Review boundaries</b>{review.limitations.map((limitation) => <p key={limitation}>{limitation}</p>)}</div>
                  </div>
                )}
              </section>
            )}
          </main>
          <aside className="panel notion-review-guide">
            <History size={21} />
            <span>Revision discipline</span>
            <ol>
              <li><b>Choose a page</b><small>Only selected, active Notion sources appear.</small></li>
              <li><b>Pick a baseline</b><small>Compare the latest sync with a retained prior version.</small></li>
              <li><b>Verify citations</b><small>Every surfaced claim points back to revision evidence.</small></li>
            </ol>
            <div><ShieldCheck size={14} /><p>Reviews are Notion-only, read-only, and never create graph relationships or change impact findings.</p></div>
          </aside>
        </div>
      )}
    </div>
  );
}
