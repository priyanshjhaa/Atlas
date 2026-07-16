"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bell,
  BookOpen,
  Box,
  Check,
  ChevronDown,
  Code2,
  Database,
  FileCode2,
  FileText,
  Filter,
  GitBranch,
  GitPullRequest,
  LayoutDashboard,
  Link2,
  Menu,
  Network,
  PanelLeftClose,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  Zap,
} from "lucide-react";
import { AtlasGraph } from "./atlas-graph";
import { AtlasMark, ConfidenceBadge } from "./brand";
import {
  activity,
  directImpacts,
  downstreamImpacts,
  evidence,
  metrics,
  pullRequests,
  repositories,
  searchGroups,
  workspace,
  type ImpactItem,
} from "../lib/mock-data";

export type AtlasPage = "dashboard" | "impact-new" | "impact-report" | "graph" | "architecture" | "search" | "sources" | "activity" | "settings";

const navItems = [
  { href: "/app", label: "Overview", icon: LayoutDashboard },
  { href: "/app/impact/new", label: "Impact analysis", icon: Zap },
  { href: "/app/graph", label: "Engineering graph", icon: Network },
  { href: "/app/architecture", label: "Architecture", icon: GitBranch },
  { href: "/app/search", label: "Search", icon: Search },
];

const utilityItems = [
  { href: "/app/sources", label: "Sources", icon: Database },
  { href: "/app/activity", label: "Activity", icon: Activity },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

function PageHeader({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail: string; action?: React.ReactNode }) {
  return (
    <header className="page-header">
      <div><span>{eyebrow}</span><h1>{title}</h1><p>{detail}</p></div>
      {action}
    </header>
  );
}

function StatusDot({ state = "ready" }: { state?: "ready" | "running" | "warning" }) {
  return <span className={`status-dot status-dot--${state}`} />;
}

function MetricCard({ metric }: { metric: (typeof metrics)[number] }) {
  return <article className={`metric-card metric-card--${metric.tone}`}><span>{metric.label}</span><strong>{metric.value}</strong><p>{metric.change}</p></article>;
}

function ImpactCard({ item }: { item: ImpactItem }) {
  return (
    <article className="impact-card">
      <div className="impact-card__icon">{item.kind === "Endpoint" ? <Link2 size={17} /> : item.kind === "Package" ? <Box size={17} /> : <Code2 size={17} />}</div>
      <div className="impact-card__copy"><span>{item.kind}</span><h3>{item.title}</h3><p>{item.detail}</p><code>{item.evidence}</code></div>
      <ConfidenceBadge type={item.confidence} />
    </article>
  );
}

function Dashboard() {
  return (
    <>
      <PageHeader eyebrow="Workspace overview" title="Good morning, Priyansh." detail="Northstar Labs is mapped and ready. Here’s what changed since your last visit." action={<Link className="button button--primary" href="/app/impact/new"><Zap size={16} /> Analyze a change</Link>} />
      <div className="metrics-grid">{metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}</div>
      <div className="dashboard-grid">
        <section className="panel panel--graph">
          <div className="panel-heading"><div><span>Live system map</span><h2>Connected architecture</h2></div><Link href="/app/graph">Open graph <ArrowRight size={14} /></Link></div>
          <AtlasGraph compact />
        </section>
        <section className="panel">
          <div className="panel-heading"><div><span>Suggested investigations</span><h2>Ask Atlas</h2></div><Sparkles size={18} /></div>
          <div className="question-list">
            {["What breaks if we change the refresh-token response?", "How does checkout reach the invoice queue?", "Why was Redis introduced for sessions?"].map((question, index) => (
              <Link href={index === 0 ? "/app/impact/demo" : "/app/search"} key={question}><span>0{index + 1}</span><p>{question}</p><ArrowRight size={15} /></Link>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading"><div><span>Change radar</span><h2>Pull requests to watch</h2></div><GitPullRequest size={18} /></div>
          <div className="pr-list">{pullRequests.map((pr) => <article key={pr.id}><span className={`risk risk--${pr.risk.toLowerCase()}`}>{pr.risk}</span><div><b>{pr.id} {pr.title}</b><p>{pr.repo} · {pr.author}</p></div></article>)}</div>
        </section>
        <section className="panel">
          <div className="panel-heading"><div><span>Repository intelligence</span><h2>Index activity</h2></div><Link href="/app/activity">View all</Link></div>
          <div className="timeline timeline--compact">{activity.slice(0, 3).map((item) => <div key={item.title}><StatusDot state={item.state === "running" ? "running" : "ready"} /><span>{item.time}</span><p><b>{item.title}</b><small>{item.detail}</small></p></div>)}</div>
        </section>
      </div>
    </>
  );
}

function ImpactNew() {
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
          {mode === "planned" ? (
            <>
              <label className="field"><span>Repository</span><button className="select-like"><GitBranch size={16} /> identity-service <ChevronDown size={15} /></button></label>
              <div className="field-row"><label className="field"><span>Base revision</span><button className="select-like"><GitBranch size={15} /> main <ChevronDown size={15} /></button></label><label className="field"><span>Scope</span><button className="select-like"><Network size={15} /> Entire workspace <ChevronDown size={15} /></button></label></div>
              <label className="field"><span>Describe the intended change</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} /><small>Be specific about contracts, symbols, or behavior you expect to modify.</small></label>
              <label className="field"><span>Anchors <em>optional</em></span><div className="anchor-box"><span><Code2 size={13} /> SessionController.refresh <X size={12} /></span><span><Link2 size={13} /> POST /v2/auth/refresh <X size={12} /></span><button><Plus size={14} /> Add entity</button></div></label>
            </>
          ) : (
            <><label className="field"><span>GitHub pull request</span><div className="search-input"><GitPullRequest size={16} /><input aria-label="Pull request" defaultValue="northstar/identity-service#482" /></div></label><div className="pr-preview"><GitBranch size={20} /><div><span>identity-service · PR #482</span><h3>Replace session tokens with rotating refresh tokens</h3><p>12 files changed · +284 −91 · Maya Chen</p></div><Check size={17} /></div></>
          )}
          <div className="form-footer"><p><ShieldCheck size={15} /> Analysis is evidence-backed and read-only.</p><button onClick={analyze} disabled={running || !description} className="button button--primary">{running ? <><RefreshCw className="spin" size={16} /> Analyzing…</> : <><Zap size={16} /> Analyze impact</>}</button></div>
        </section>
        <aside className="analysis-aside">
          <span className="aside-label">How Atlas reasons</span>
          <div className="reasoning-steps">{steps.map((step, index) => <div key={step} className={running ? "is-running" : ""}><i>{running ? <Check size={12} /> : index + 1}</i><span>{step}</span></div>)}</div>
          <div className="coverage-card"><span>Workspace coverage</span><strong>{workspace.coverage}%</strong><div><i style={{ width: `${workspace.coverage}%` }} /></div><p>12 repositories and 86 Notion pages are available for this analysis.</p></div>
        </aside>
      </div>
    </>
  );
}

function ImpactReport() {
  return (
    <>
      <div className="report-top"><Link href="/app/impact/new"><ArrowLeft size={15} /> New analysis</Link><div><span>Completed 2 minutes ago</span><button className="button button--ghost"><GitPullRequest size={15} /> Open PR #482</button></div></div>
      <section className="report-hero">
        <div><p className="eyebrow"><Sparkles size={14} /> Impact report</p><h1>Rotate refresh tokens and<br />change the session response.</h1><p>identity-service · main · Entire workspace</p></div>
        <div className="risk-score"><span>Change risk</span><strong>High</strong><p>7 affected components<br />across 4 repositories</p></div>
      </section>
      <section className="executive-summary panel"><div className="summary-icon"><AlertTriangle size={21} /></div><div><span>Executive summary</span><h2>This contract crosses three repository boundaries and has one unverified external consumer.</h2><p>Coordinate identity-service, api-gateway, and storefront-web changes. Roll out behind the existing <code>rotating_sessions</code> flag, then verify mobile clients before removing the previous response field.</p></div></section>
      <div className="report-grid">
        <main>
          <section className="report-section"><div className="report-section__heading"><div><span>01</span><h2>Confirmed direct impact</h2></div><p>Source-backed structural relationships</p></div><div className="impact-card-list">{directImpacts.map((item) => <ImpactCard key={item.title} item={item} />)}</div></section>
          <section className="report-section"><div className="report-section__heading"><div><span>02</span><h2>Downstream and unknown</h2></div><p>Observed, historical, and inferred context</p></div><div className="impact-card-list">{downstreamImpacts.map((item) => <ImpactCard key={item.title} item={item} />)}</div></section>
          <section className="report-section"><div className="report-section__heading"><div><span>03</span><h2>Cross-repository path</h2></div><Link href="/app/graph">Explore graph <ArrowRight size={14} /></Link></div><div className="path-diagram"><div>identity-service<small>SessionController</small></div><ArrowRight size={17} /><div>shared-contracts<small>RefreshSessionResponse</small></div><ArrowRight size={17} /><div>api-gateway<small>response validator</small></div><ArrowRight size={17} /><div>storefront-web<small>edge middleware</small></div></div></section>
          <section className="report-section"><div className="report-section__heading"><div><span>04</span><h2>Verification plan</h2></div></div><div className="check-list">{["Add contract tests for both response shapes during migration.", "Run storefront edge-session integration tests.", "Confirm mobile client ownership and supported versions.", "Monitor refresh failures and replay detection after rollout."].map((item) => <label key={item}><input type="checkbox" /> <span>{item}</span></label>)}</div></section>
        </main>
        <aside className="report-aside">
          <div className="panel sticky-panel"><div className="panel-heading"><div><span>Supporting context</span><h2>Evidence</h2></div><FileText size={17} /></div><div className="evidence-list">{evidence.map((item) => <article key={item.title} className={`evidence-row evidence-row--${item.tone}`}><span>{item.source}</span><b>{item.title}</b><p>{item.detail}</p><ArrowRight size={14} /></article>)}</div></div>
          <div className="panel owner-panel"><span>Affected owners</span><div className="avatar-stack"><i>MC</i><i>JL</i><i>AR</i></div><b>Identity, Platform & Web</b><p>Suggested lead reviewer: Maya Chen</p></div>
          <div className="feedback-panel"><span>Was this analysis useful?</span><div><button>Correct</button><button>Missing</button><button>Uncertain</button></div></div>
        </aside>
      </div>
    </>
  );
}

function GraphPage({ architecture = false }: { architecture?: boolean }) {
  const [filter, setFilter] = useState("All entities");
  return (
    <>
      <PageHeader eyebrow={architecture ? "System architecture" : "Engineering knowledge graph"} title={architecture ? "How Northstar fits together" : "Explore every relationship"} detail={architecture ? "A live, source-backed view of services, data stores, queues, and system boundaries." : "Navigate repositories, code, ownership, history, and documentation as one connected system."} action={<div className="view-actions"><button className="button button--ghost"><RefreshCw size={14} /> Updated 4m ago</button><button className="button button--primary"><Plus size={14} /> Save view</button></div>} />
      <div className="graph-toolbar"><div className="search-input"><Search size={15} /><input aria-label="Find graph entity" placeholder="Find a service, symbol, endpoint…" /></div><div className="filter-pills">{["All entities", "Services", "Code", "Data", "Knowledge"].map((item) => <button className={filter === item ? "active" : ""} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div><button className="button button--ghost"><Filter size={14} /> Filters</button></div>
      <div className="graph-layout">
        <section className="panel graph-canvas"><AtlasGraph /></section>
        <aside className="panel entity-inspector"><div className="entity-icon"><ShieldCheck size={20} /></div><span>Service · observed</span><h2>Identity Service</h2><p>Owns user authentication, rotating sessions, and account recovery.</p><div className="entity-meta"><div><span>Repository</span><b>identity-service</b></div><div><span>Owner</span><b>Identity team</b></div><div><span>Last indexed</span><b>4 minutes ago</b></div></div><h3>Key relationships</h3><div className="relationship-list"><div><span>called by</span><b>API Gateway</b></div><div><span>stores in</span><b>Session Redis</b></div><div><span>exports</span><b>12 endpoints</b></div><div><span>documented by</span><b>ADR-024</b></div></div><Link href="/app/impact/demo" className="button button--primary">Analyze a change here <ArrowRight size={15} /></Link></aside>
      </div>
    </>
  );
}

function SearchPage() {
  const [query, setQuery] = useState("authentication refresh tokens");
  const groups = useMemo(() => searchGroups, []);
  return (
    <>
      <PageHeader eyebrow="Engineering search" title="Find the system, not just the file" detail="Search across code, architecture, pull requests, and technical decisions." />
      <div className="search-hero"><Search size={20} /><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Engineering search" /><kbd>⌘ K</kbd></div>
      <div className="search-layout"><main><div className="search-summary"><span>12 results for “{query}”</span><button><Filter size={14} /> Filter</button></div>{groups.map((group) => <section className="search-group" key={group.label}><h2>{group.label}<span>{group.items.length}</span></h2>{group.items.map((item) => <Link href={item.meta.includes("Notion") ? "/app/sources" : "/app/graph"} key={item.title}><div className="search-result-icon">{group.label === "Code" ? <FileCode2 size={17} /> : group.label === "Knowledge" ? <BookOpen size={17} /> : <Network size={17} />}</div><div><span>{item.meta}</span><h3>{item.title}</h3><p>{item.detail}</p></div><ArrowRight size={15} /></Link>)}</section>)}</main><aside className="panel search-aside"><span>Atlas understood this as</span><h3>Authentication flow</h3><p>Prioritizing services and code paths involved in refreshing authenticated sessions.</p><div><ConfidenceBadge type="observed" /> <span>8 structural results</span></div><div><ConfidenceBadge type="historical" /> <span>3 historical results</span></div><div><ConfidenceBadge type="inferred" /> <span>1 inferred result</span></div><Link href="/app/impact/new" className="button button--primary">Analyze a related change</Link></aside></div>
    </>
  );
}

function SourcesPage() {
  const [githubConnected, setGithubConnected] = useState(true);
  const [notionConnected, setNotionConnected] = useState(true);
  return (
    <>
      <PageHeader eyebrow="Connected context" title="Sources" detail="Control what Atlas can index and see the freshness of every engineering source." action={<button className="button button--primary"><Plus size={15} /> Connect source</button>} />
      <div className="connector-grid"><article className="connector-card"><div className="connector-top"><i><GitBranch size={22} /></i><ConfidenceBadge type="observed" /></div><h2>GitHub</h2><p>Code, pull requests, commits, authors, and reviews from Northstar Labs.</p><div className="connector-stats"><div><b>12</b><span>repositories</span></div><div><b>1.4k</b><span>pull requests</span></div><div><b>4m</b><span>last sync</span></div></div><div className="connector-footer"><label><input type="checkbox" checked={githubConnected} onChange={(event) => setGithubConnected(event.target.checked)} /><span /></label><b>{githubConnected ? "Connected" : "Paused"}</b><button>Manage</button></div></article><article className="connector-card"><div className="connector-top"><i className="notion-icon">N</i><ConfidenceBadge type="observed" /></div><h2>Notion</h2><p>Architecture decisions, runbooks, and technical design documents.</p><div className="connector-stats"><div><b>86</b><span>pages</span></div><div><b>6</b><span>databases</span></div><div><b>12m</b><span>last sync</span></div></div><div className="connector-footer"><label><input type="checkbox" checked={notionConnected} onChange={(event) => setNotionConnected(event.target.checked)} /><span /></label><b>{notionConnected ? "Connected" : "Paused"}</b><button>Manage</button></div></article><article className="connector-card connector-card--add"><Plus size={23} /><h2>Add another source</h2><p>Operational context is coming after the Atlas pilot.</p><button className="button button--ghost">View roadmap</button></article></div>
      <section className="panel repository-table"><div className="panel-heading"><div><span>GitHub repositories</span><h2>Index coverage</h2></div><div className="search-input search-input--small"><Search size={14} /><input placeholder="Filter repositories" /></div></div><div className="table-head"><span>Repository</span><span>Language</span><span>Files</span><span>Status</span><span>Updated</span></div>{repositories.map((repo) => <div className="table-row" key={repo.name}><span><GitBranch size={15} /><b>{repo.name}</b></span><span>{repo.language}</span><span>{repo.files}</span><span><StatusDot state={repo.status === "Syncing" ? "running" : "ready"} /> {repo.status}</span><span>{repo.updated}</span></div>)}</section>
    </>
  );
}

function ActivityPage() {
  return (
    <><PageHeader eyebrow="Repository intelligence" title="Sync activity" detail="Watch Atlas transform engineering sources into structured, searchable context." action={<button className="button button--primary"><RefreshCw size={15} /> Sync all</button>} /><div className="activity-grid"><section className="panel active-sync"><div className="panel-heading"><div><span>Currently indexing</span><h2>billing-service</h2></div><span className="running-badge"><RefreshCw className="spin" size={13} /> Running</span></div><div className="sync-progress"><div><span>Resolving symbols and imports</span><b>68%</b></div><div className="progress-track"><i style={{ width: "68%" }} /></div><p>438 of 719 files · 24 seconds elapsed</p></div><div className="sync-stages">{["Download source", "Parse project", "Resolve graph", "Create embeddings", "Publish index"].map((step, index) => <div className={index < 2 ? "done" : index === 2 ? "current" : ""} key={step}><i>{index < 2 ? <Check size={12} /> : index + 1}</i><span>{step}</span></div>)}</div></section><section className="panel activity-stats"><div><span>Successful syncs</span><strong>284</strong><p>99.3% this month</p></div><div><span>Median duration</span><strong>42s</strong><p>−8s from last week</p></div><div><span>Graph changes</span><strong>241</strong><p>this week</p></div></section></div><section className="panel activity-log"><div className="panel-heading"><div><span>Workspace events</span><h2>Recent activity</h2></div><button className="button button--ghost"><Filter size={14} /> Filter</button></div><div className="timeline">{[...activity, { time: "Yesterday", title: "Repository disconnected", detail: "legacy-auth-proxy · data removed", state: "done" }, { time: "Yesterday", title: "GitHub permissions updated", detail: "2 repositories added by Priyansh", state: "done" }].map((item) => <div key={`${item.time}-${item.title}`}><StatusDot state={item.state === "running" ? "running" : "ready"} /><span>{item.time}</span><p><b>{item.title}</b><small>{item.detail}</small></p><button>Details</button></div>)}</div></section></>
  );
}

function SettingsPage() {
  const [section, setSection] = useState("Workspace");
  return (
    <><PageHeader eyebrow="Workspace administration" title="Settings" detail="Manage Northstar Labs, its members, access, and Atlas preferences." /><div className="settings-layout"><aside>{["Workspace", "Members", "Access & roles", "Notifications", "Data & privacy"].map((item) => <button className={section === item ? "active" : ""} onClick={() => setSection(item)} key={item}>{item === "Members" ? <Users size={15} /> : item === "Access & roles" ? <ShieldCheck size={15} /> : item === "Notifications" ? <Bell size={15} /> : item === "Data & privacy" ? <Database size={15} /> : <Settings size={15} />}{item}</button>)}</aside><main className="panel settings-panel"><span>General</span><h2>{section}</h2><p>Configure how this Atlas workspace appears to your engineering team.</p><div className="settings-form"><label className="field"><span>Workspace name</span><input defaultValue="Northstar Labs" /></label><label className="field"><span>Workspace slug</span><div className="prefix-input"><span>atlas.dev/</span><input defaultValue="northstar" /></div></label><label className="field"><span>Default analysis scope</span><button className="select-like"><Network size={15} /> Entire workspace <ChevronDown size={15} /></button></label><div className="setting-toggle"><div><b>Show inferred relationships</b><p>Include low-confidence semantic relationships in graph views.</p></div><label><input type="checkbox" defaultChecked /><span /></label></div><div className="setting-toggle"><div><b>Weekly intelligence digest</b><p>Send architecture and knowledge changes every Monday.</p></div><label><input type="checkbox" defaultChecked /><span /></label></div></div><div className="settings-actions"><button className="button button--primary">Save changes</button></div></main></div></>
  );
}

export function AtlasApp({ page }: { page: AtlasPage }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const content = page === "dashboard" ? <Dashboard /> : page === "impact-new" ? <ImpactNew /> : page === "impact-report" ? <ImpactReport /> : page === "graph" ? <GraphPage /> : page === "architecture" ? <GraphPage architecture /> : page === "search" ? <SearchPage /> : page === "sources" ? <SourcesPage /> : page === "activity" ? <ActivityPage /> : <SettingsPage />;
  return (
    <div className="app-frame">
      <button className="mobile-nav-toggle" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle navigation"><Menu size={18} /></button>
      <aside className={`app-sidebar ${mobileOpen ? "is-open" : ""}`}>
        <div className="sidebar-top"><AtlasMark /><button aria-label="Collapse sidebar"><PanelLeftClose size={17} /></button></div>
        <button className="workspace-switcher"><span>{workspace.initials}</span><div><b>{workspace.name}</b><small>12 repositories</small></div><ChevronDown size={14} /></button>
        <nav>{navItems.map((item) => { const Icon = item.icon; const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href.replace("/new", "")); return <Link className={active ? "active" : ""} href={item.href} key={item.href} onClick={() => setMobileOpen(false)}><Icon size={17} /><span>{item.label}</span>{item.label === "Impact analysis" && <i>NEW</i>}</Link>; })}</nav>
        <nav className="sidebar-utility">{utilityItems.map((item) => { const Icon = item.icon; return <Link className={pathname.startsWith(item.href) ? "active" : ""} href={item.href} key={item.href} onClick={() => setMobileOpen(false)}><Icon size={17} /><span>{item.label}</span></Link>; })}</nav>
        <div className="index-card"><div><span>Index coverage</span><b>{workspace.coverage}%</b></div><div className="mini-progress"><i style={{ width: `${workspace.coverage}%` }} /></div><p><StatusDot /> Updated {workspace.indexedAt}</p></div>
        <div className="sidebar-user"><i>PJ</i><div><b>Priyansh Jha</b><span>Workspace admin</span></div><button><Settings size={15} /></button></div>
      </aside>
      {mobileOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <main className="app-main"><div className="app-topbar"><div className="global-search"><Search size={15} /><span>Search Northstar Labs…</span><kbd>⌘ K</kbd></div><div><button aria-label="Notifications"><Bell size={17} /><i /></button><span className="freshness"><StatusDot /> Graph current</span></div></div><div className="page-content">{content}</div></main>
    </div>
  );
}
