"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, ChevronDown, Code2, FileText, GitBranch, GitPullRequest, Link2, Network, Plus, RefreshCw, ShieldCheck, Sparkles, X, Zap } from "lucide-react";
import { ImpactCard, PageHeader } from "@/components/app/shared";
import { directImpacts, downstreamImpacts, evidence, workspace } from "@/lib/mock-data";

export function ImpactNewPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"planned" | "pull-request">("planned");
  const [description, setDescription] = useState("Replace persistent session tokens with rotating refresh tokens and update the refresh response contract.");
  const [running, setRunning] = useState(false);
  const steps = ["Resolving entities", "Traversing dependencies", "Searching history", "Checking documentation", "Building report"];

  function analyze() {
    setRunning(true);
    window.setTimeout(() => router.push("/app/impact/demo"), 1700);
  }

  return (
    <>
      <PageHeader eyebrow="Change intelligence" title="Analyze a change" detail="Describe what you plan to change. Atlas will trace the blast radius across code, architecture, history, and documentation." />
      <div className="analysis-layout">
        <section className="analysis-form panel">
          <div className="segmented" role="tablist"><button className={mode === "planned" ? "active" : ""} onClick={() => setMode("planned")}><Sparkles size={15} /> Planned change</button><button className={mode === "pull-request" ? "active" : ""} onClick={() => setMode("pull-request")}><GitPullRequest size={15} /> Pull request</button></div>
          {mode === "planned" ? <><label className="field"><span>Repository</span><button className="select-like"><GitBranch size={16} /> identity-service <ChevronDown size={15} /></button></label><div className="field-row"><label className="field"><span>Base revision</span><button className="select-like"><GitBranch size={15} /> main <ChevronDown size={15} /></button></label><label className="field"><span>Scope</span><button className="select-like"><Network size={15} /> Entire workspace <ChevronDown size={15} /></button></label></div><label className="field"><span>Describe the intended change</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} /><small>Be specific about contracts, symbols, or behavior you expect to modify.</small></label><label className="field"><span>Anchors <em>optional</em></span><div className="anchor-box"><span><Code2 size={13} /> SessionController.refresh <X size={12} /></span><span><Link2 size={13} /> POST /v2/auth/refresh <X size={12} /></span><button><Plus size={14} /> Add entity</button></div></label></> : <><label className="field"><span>GitHub pull request</span><div className="search-input"><GitPullRequest size={16} /><input aria-label="Pull request" defaultValue="northstar/identity-service#482" /></div></label><div className="pr-preview"><GitBranch size={20} /><div><span>identity-service · PR #482</span><h3>Replace session tokens with rotating refresh tokens</h3><p>12 files changed · +284 −91 · Maya Chen</p></div><Check size={17} /></div></>}
          <div className="form-footer"><p><ShieldCheck size={15} /> Analysis is evidence-backed and read-only.</p><button onClick={analyze} disabled={running || !description} className="button button--primary">{running ? <><RefreshCw className="spin" size={16} /> Analyzing…</> : <><Zap size={16} /> Analyze impact</>}</button></div>
        </section>
        <aside className="analysis-aside"><span className="aside-label">How Atlas reasons</span><div className="reasoning-steps">{steps.map((step, index) => <div key={step} className={running ? "is-running" : ""}><i>{running ? <Check size={12} /> : index + 1}</i><span>{step}</span></div>)}</div><div className="coverage-card"><span>Workspace coverage</span><strong>{workspace.coverage}%</strong><div><i style={{ width: `${workspace.coverage}%` }} /></div><p>12 repositories and 86 Notion pages are available for this analysis.</p></div></aside>
      </div>
    </>
  );
}

export function ImpactReportPage() {
  return (
    <>
      <div className="report-top"><Link href="/app/impact/new"><ArrowLeft size={15} /> New analysis</Link><div><span>Completed 2 minutes ago</span><button className="button button--ghost"><GitPullRequest size={15} /> Open PR #482</button></div></div>
      <section className="report-hero"><div><p className="eyebrow"><Sparkles size={14} /> Impact report</p><h1>Rotate refresh tokens and<br />change the session response.</h1><p>identity-service · main · Entire workspace</p></div><div className="risk-score"><span>Change risk</span><strong>High</strong><p>7 affected components<br />across 4 repositories</p></div></section>
      <section className="executive-summary panel"><div className="summary-icon"><AlertTriangle size={21} /></div><div><span>Executive summary</span><h2>This contract crosses three repository boundaries and has one unverified external consumer.</h2><p>Coordinate identity-service, api-gateway, and storefront-web changes. Roll out behind the existing <code>rotating_sessions</code> flag, then verify mobile clients before removing the previous response field.</p></div></section>
      <div className="report-grid"><main><section className="report-section"><div className="report-section__heading"><div><span>01</span><h2>Confirmed direct impact</h2></div><p>Source-backed structural relationships</p></div><div className="impact-card-list">{directImpacts.map((item) => <ImpactCard key={item.title} item={item} />)}</div></section><section className="report-section"><div className="report-section__heading"><div><span>02</span><h2>Downstream and unknown</h2></div><p>Observed, historical, and inferred context</p></div><div className="impact-card-list">{downstreamImpacts.map((item) => <ImpactCard key={item.title} item={item} />)}</div></section><section className="report-section"><div className="report-section__heading"><div><span>03</span><h2>Cross-repository path</h2></div><Link href="/app/graph">Explore graph <ArrowRight size={14} /></Link></div><div className="path-diagram"><div>identity-service<small>SessionController</small></div><ArrowRight size={17} /><div>shared-contracts<small>RefreshSessionResponse</small></div><ArrowRight size={17} /><div>api-gateway<small>response validator</small></div><ArrowRight size={17} /><div>storefront-web<small>edge middleware</small></div></div></section><section className="report-section"><div className="report-section__heading"><div><span>04</span><h2>Verification plan</h2></div></div><div className="check-list">{["Add contract tests for both response shapes during migration.", "Run storefront edge-session integration tests.", "Confirm mobile client ownership and supported versions.", "Monitor refresh failures and replay detection after rollout."].map((item) => <label key={item}><input type="checkbox" /> <span>{item}</span></label>)}</div></section></main>
        <aside className="report-aside"><div className="panel sticky-panel"><div className="panel-heading"><div><span>Supporting context</span><h2>Evidence</h2></div><FileText size={17} /></div><div className="evidence-list">{evidence.map((item) => <article key={item.title} className={`evidence-row evidence-row--${item.tone}`}><span>{item.source}</span><b>{item.title}</b><p>{item.detail}</p><ArrowRight size={14} /></article>)}</div></div><div className="panel owner-panel"><span>Affected owners</span><div className="avatar-stack"><i>MC</i><i>JL</i><i>AR</i></div><b>Identity, Platform & Web</b><p>Suggested lead reviewer: Maya Chen</p></div><div className="feedback-panel"><span>Was this analysis useful?</span><div><button>Correct</button><button>Missing</button><button>Uncertain</button></div></div></aside>
      </div>
    </>
  );
}
