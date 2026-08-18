"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, BookOpenText, Check, CircleDashed, FileCode2, GitBranch, GitPullRequestArrow, Network, Search, Sparkles, Zap } from "lucide-react";
import { AtlasGraph } from "@/components/atlas-graph";
import { PageHeader } from "@/components/app/shared";
import type { AtlasGraph as AtlasGraphData, AtlasRepository, AtlasSourceReadinessStatus, AtlasWorkspace, AtlasWorkspaceOverview } from "@/lib/api-types";

export function greetingForHour(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const STATUS_LABELS: Record<AtlasSourceReadinessStatus, string> = {
  disconnected: "Not connected",
  skipped: "Optional · not connected",
  indexing: "Indexing context",
  ready: "Ready for analysis",
  stale: "Refresh recommended",
  failed: "Needs attention",
};

function sourceDetail(provider: "github" | "notion", overview: AtlasWorkspaceOverview) {
  if (provider === "github") {
    const source = overview.readiness.github;
    if (source.status === "disconnected") return "Connect code to build your system map.";
    return `${source.repositoriesReady} of ${source.repositoriesConnected} repositories indexed`;
  }
  const source = overview.readiness.notion;
  if (["disconnected", "skipped"].includes(source.status)) return "Add ADRs, decisions, specifications, and runbooks.";
  return `${source.documentsIndexed} documents across ${source.resourcesSelected} selected sources`;
}

function timeAgo(date: string | null, now: string) {
  if (!date) return "No successful sync yet";
  const hours = Math.max(0, Math.floor((Date.parse(now) - Date.parse(date)) / 3_600_000));
  if (hours < 1) return "Updated within the hour";
  if (hours < 24) return `Updated ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Updated ${days}d ago`;
}

function ReadinessCard({ provider, overview }: { provider: "github" | "notion"; overview: AtlasWorkspaceOverview }) {
  const source = overview.readiness[provider];
  const Icon = provider === "github" ? GitBranch : BookOpenText;
  return (
    <article className={`readiness-card readiness-card--${source.status}`}>
      <div className="readiness-card__icon"><Icon size={18} /></div>
      <div className="readiness-card__copy">
        <span>{provider === "github" ? "GitHub implementation" : "Notion decisions"}</span>
        <strong>{STATUS_LABELS[source.status]}</strong>
        <p>{sourceDetail(provider, overview)}</p>
      </div>
      <div className="readiness-card__meta">
        <small>{timeAgo(source.lastSyncedAt, overview.generatedAt)}</small>
        <Link href="/app/sources" aria-label={`Manage ${provider} source`}>{source.status === "ready" ? "Manage" : "Review"} <ArrowRight size={13} /></Link>
      </div>
    </article>
  );
}

export function DashboardPage({ userName, workspace, repositories, overview, graph }: {
  userName: string;
  workspace: AtlasWorkspace;
  repositories: AtlasRepository[];
  overview: AtlasWorkspaceOverview;
  graph: AtlasGraphData | null;
}) {
  const firstName = userName.trim().split(/\s+/)[0] || userName;
  const [greeting, setGreeting] = useState("Welcome");
  const activeRepositories = repositories.filter((item) => item.isActive);

  useEffect(() => {
    const updateGreeting = () => setGreeting(greetingForHour(new Date().getHours()));
    updateGreeting();
    const interval = window.setInterval(updateGreeting, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const suggestedQuestions = useMemo(() => {
    const name = activeRepositories.find((item) => item.lastSyncedAt)?.name;
    return name ? [
      { text: `What depends on ${name}?`, href: "/app/search", icon: Network },
      { text: "Which decisions constrain the next change?", href: "/app/search?provider=notion", icon: BookOpenText },
      { text: "What could break if we change an API?", href: "/app/impact/new", icon: GitPullRequestArrow },
    ] : [
      { text: "Which repository should we synchronize first?", href: "/app/sources", icon: GitBranch },
      { text: "Add the decisions that explain why the system exists", href: "/app/sources", icon: BookOpenText },
      { text: "Prepare the workspace for its first analysis", href: "/app/sources", icon: Sparkles },
    ];
  }, [activeRepositories]);

  const readinessCopy = {
    ready: "Your current context is ready for a source-backed change analysis.",
    attention: "Some workspace context needs attention before your next high-confidence analysis.",
    indexing: "Atlas is updating the workspace map. You can explore while indexing continues.",
    needs_setup: "Connect implementation sources to begin building your workspace context.",
  }[overview.readiness.overall];

  return (
    <div className="dashboard-page cockpit">
      <section className="dashboard-command cockpit-command">
        <div className="command-coordinates"><span>WORKSPACE COCKPIT / {workspace.slug.toUpperCase()}</span><span>{overview.jobs.active ? `${overview.jobs.active} CONTEXT JOBS ACTIVE` : "CONTEXT QUEUE CLEAR"}</span></div>
        <PageHeader eyebrow="Engineering context, in focus" title={`${greeting}, ${firstName}.`} detail={readinessCopy} action={<Link className="button button--primary" href="/app/impact/new"><Zap size={16} /> Analyze a change</Link>} />
      </section>

      <section className="readiness-rail" aria-label="Source readiness">
        <div className="readiness-rail__intro"><span>Context readiness</span><strong>{overview.readiness.overall === "ready" ? "Atlas is ready" : "Review workspace context"}</strong></div>
        <ReadinessCard provider="github" overview={overview} />
        <ReadinessCard provider="notion" overview={overview} />
      </section>

      <div className="cockpit-priority-grid">
        <section className="panel cockpit-attention">
          <div className="panel-heading"><div><span>Priority queue</span><h2>What needs your attention</h2></div>{overview.attention.length ? <AlertTriangle size={18} /> : <Check size={18} />}</div>
          <div className="attention-list">
            {overview.attention.length ? overview.attention.map((item, index) => <article className={`attention-item attention-item--${item.severity}`} key={item.id}><span>0{index + 1}</span><div><strong>{item.title}</strong><p>{item.detail}</p></div><Link href={item.action.href}>{item.action.label}<ArrowRight size={13} /></Link></article>) : <div className="cockpit-empty"><Check size={20} /><div><strong>No source issues detected</strong><p>GitHub implementation and available documentation context are ready.</p></div></div>}
          </div>
        </section>

        <section className="panel cockpit-reports">
          <div className="panel-heading"><div><span>Recent impact reports</span><h2>Latest change intelligence</h2></div><Link href="/app/impact/new">New analysis <ArrowRight size={13} /></Link></div>
          <div className="report-list">
            {overview.recentReports.length ? overview.recentReports.map((report) => <Link href={`/app/impact/${report.id}`} key={report.id}><span className={`risk-mark risk-mark--${report.riskLevel}`}>{report.riskLevel}</span><div><strong>{report.title}</strong><p>{report.repository.owner}/{report.repository.name} · {report.unknownCount} unknown{report.unknownCount === 1 ? "" : "s"}</p></div><ArrowRight size={14} /></Link>) : <div className="cockpit-empty"><CircleDashed size={20} /><div><strong>No impact reports yet</strong><p>Analyze a proposed change to reveal direct effects, downstream dependencies, evidence, and unknowns.</p></div><Link href="/app/impact/new">Run first analysis <ArrowRight size={13} /></Link></div>}
          </div>
        </section>
      </div>

      <section className="knowledge-strip" aria-label="Indexed knowledge context">
        <div><span>Knowledge context</span><strong>What Atlas can reason over</strong></div>
        <article><FileCode2 size={16} /><strong>{overview.intelligence.codeFiles.toLocaleString()}</strong><span>Code files</span></article>
        <article><Network size={16} /><strong>{overview.intelligence.relationships.toLocaleString()}</strong><span>Relationships</span></article>
        <article><BookOpenText size={16} /><strong>{overview.intelligence.notionDocuments.toLocaleString()}</strong><span>Notion documents</span></article>
        <article><Search size={16} /><strong>{(overview.intelligence.codeChunks + overview.intelligence.notionChunks).toLocaleString()}</strong><span>Searchable chunks</span></article>
      </section>

      <div className="dashboard-grid cockpit-secondary-grid">
        <section className="panel panel--graph"><div className="panel-heading"><div><span>Secondary system view</span><h2>Connected architecture graph</h2>{activeRepositories[0] && <small className="panel-context">{activeRepositories[0].owner}/{activeRepositories[0].name}</small>}</div><Link href="/app/graph">Explore map <ArrowRight size={14} /></Link></div><AtlasGraph compact graph={graph} repositories={activeRepositories} /></section>
        <section className="panel cockpit-investigations"><div className="panel-heading"><div><span>Suggested investigations</span><h2>Follow the context</h2></div><Sparkles size={18} /></div><div className="question-list">{suggestedQuestions.map(({ text, href, icon: Icon }, index) => <Link href={href} key={text}><span>0{index + 1}</span><Icon size={15} /><p>{text}</p><ArrowRight size={15} /></Link>)}</div></section>
      </div>
    </div>
  );
}
