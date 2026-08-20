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
  MessageCircleQuestion,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type {
  AtlasNotionCatchUpBriefing,
  AtlasNotionCatchUpSnapshot,
  AtlasNotionContextCitation,
  AtlasNotionQuestionAnswer,
  AtlasWorkspace,
} from "@/lib/api-types";

type ContextView = "catch-up" | "ask";

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
  action: "briefings" | "acknowledge" | "questions",
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
}: {
  workspace: AtlasWorkspace;
  initialSnapshot: AtlasNotionCatchUpSnapshot | null;
}) {
  const [view, setView] = useState<ContextView>("catch-up");
  const [briefing, setBriefing] = useState<AtlasNotionCatchUpBriefing | null>(null);
  const [answer, setAnswer] = useState<AtlasNotionQuestionAnswer | null>(null);
  const [question, setQuestion] = useState("");
  const [loadingBriefing, setLoadingBriefing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
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
        <button disabled title="Document review follows after Catch up and Ask are approved">
          <FileDiff size={15} /><span><b>Review</b><small>Next gated delivery</small></span>
        </button>
      </nav>

      {error && <div className="context-alert" role="alert"><ShieldCheck size={16} />{error}</div>}

      {!snapshot ? (
        <section className="context-empty panel">
          <BookOpenText size={28} />
          <h2>Notion context could not be loaded.</h2>
          <p>Confirm that the backend is running, then retry this page.</p>
        </section>
      ) : snapshot.availability !== "ready" ? (
        <section className="context-empty panel">
          <div className="context-empty__mark">N</div>
          <h2>{snapshot.availability === "not_connected" ? "Connect Notion to begin a team memory." : "Choose the Notion sources Atlas may remember."}</h2>
          <p>Sources remains the place for OAuth, page selection, and synchronization. This page only reads workspace-approved, synchronized material.</p>
          <Link className="button button--primary" href="/app/sources">Manage Notion sources <ArrowRight size={14} /></Link>
        </section>
      ) : view === "catch-up" ? (
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
      ) : (
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
      )}
    </div>
  );
}
