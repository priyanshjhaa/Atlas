"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, Check, Database, Filter, GitBranch, Plus, RefreshCw, Search, Settings, ShieldCheck, Users, X } from "lucide-react";
import { ConfidenceBadge } from "@/components/brand";
import { PageHeader, StatusDot } from "@/components/app/shared";
import type {
  AtlasGitHubConnector,
  AtlasRepository,
  AtlasSyncJob,
  AtlasWorkspace,
} from "@/lib/api-types";

function formatLastSync(value: string | null) {
  if (!value) return "Not synced";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function SourcesPage({
  githubConnectors,
  repositories,
  workspace,
}: {
  githubConnectors: AtlasGitHubConnector[];
  repositories: AtlasRepository[];
  workspace: AtlasWorkspace;
}) {
  const [notionConnected, setNotionConnected] = useState(true);
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<"connect" | "github" | "notion" | null>(null);
  const [notice, setNotice] = useState("");

  const visibleRepositories = useMemo(
    () => repositories.filter((repo) => repo.name.toLowerCase().includes(query.toLowerCase())),
    [query, repositories],
  );
  const githubConnector = githubConnectors.find(
    (connector) => connector.status === "active",
  );
  const canManageGitHub = ["owner", "admin"].includes(workspace.role);

  function connect(source: "github" | "notion") {
    if (source === "github") {
      window.location.assign(
        `/api/github/install?workspaceId=${encodeURIComponent(workspace.id)}`,
      );
      return;
    }
    setNotionConnected(true);
    setNotice("Notion is ready for preview configuration.");
    setDialog("notion");
  }

  return (
    <>
      <PageHeader eyebrow="Connected context" title="Sources" detail="Control what Atlas can index and see the freshness of every engineering source." action={<button className="button button--primary" onClick={() => setDialog("connect")}><Plus size={15} /> Connect source</button>} />
      {notice && <p className="action-notice" aria-live="polite">{notice}</p>}

      <div className="connector-grid">
        <article className="connector-card">
          <div className="connector-top"><i><GitBranch size={22} /></i><ConfidenceBadge type="observed" /></div>
          <h2>GitHub</h2>
          <p>Code, pull requests, commits, authors, and reviews from {workspace.name}.</p>
          <div className="connector-stats"><div><b>{repositories.length}</b><span>repositories</span></div><div><b>—</b><span>pull requests</span></div><div><b>—</b><span>last sync</span></div></div>
          <div className="connector-footer"><StatusDot state={githubConnector ? "ready" : "running"} /><b>{githubConnector ? `Connected to ${githubConnector.configuration.account ?? "GitHub"}` : "Not connected"}</b><button onClick={() => githubConnector ? setDialog("github") : connect("github")} disabled={!canManageGitHub}>{githubConnector ? "Manage" : "Connect"}</button></div>
        </article>
        <article className="connector-card">
          <div className="connector-top"><i className="notion-icon">N</i><ConfidenceBadge type="observed" /></div>
          <h2>Notion</h2>
          <p>Architecture decisions, runbooks, and technical design documents.</p>
          <div className="connector-stats"><div><b>86</b><span>pages</span></div><div><b>6</b><span>databases</span></div><div><b>12m</b><span>last sync</span></div></div>
          <div className="connector-footer"><label><input type="checkbox" checked={notionConnected} onChange={(event) => setNotionConnected(event.target.checked)} /><span /></label><b>{notionConnected ? "Connected" : "Paused"}</b><button onClick={() => setDialog("notion")}>Manage</button></div>
        </article>
        <article className="connector-card connector-card--add">
          <Plus size={23} /><h2>Add another source</h2><p>Operational context is coming after the Atlas pilot.</p>
          <button className="button button--ghost" onClick={() => setNotice("Slack, Linear, and incident-management connectors are planned after the pilot.")}>View roadmap</button>
        </article>
      </div>

      <section className="panel repository-table">
        <div className="panel-heading">
          <div><span>GitHub repositories</span><h2>Index coverage</h2></div>
          <label className="search-input search-input--small"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter repositories" /></label>
        </div>
        <div className="table-head"><span>Repository</span><span>Branch</span><span>Visibility</span><span>Status</span><span>Last synced</span></div>
        {visibleRepositories.map((repo) => <div className="table-row" key={repo.id}><span><GitBranch size={15} /><b>{repo.owner}/{repo.name}</b></span><span>{repo.defaultBranch ?? "—"}</span><span>{repo.isPrivate ? "Private" : "Public"}</span><span><StatusDot state={repo.isActive ? "ready" : "running"} /> {repo.isActive ? "Active" : "Paused"}</span><span>{formatLastSync(repo.lastSyncedAt)}</span></div>)}
        {visibleRepositories.length === 0 && <div className="empty-state"><Search size={20} /><h2>No repositories found</h2><p>Try another repository name.</p></div>}
      </section>

      {dialog && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => setDialog(null)}>
          <section className="dialog-card" role="dialog" aria-modal="true" aria-label="Source configuration" onMouseDown={(event) => event.stopPropagation()}>
            <button className="dialog-close" onClick={() => setDialog(null)} aria-label="Close"><X size={17} /></button>
            {dialog === "connect" ? (
              <>
                <span>Connect context</span><h2>Choose a source</h2><p>GitHub uses a dedicated App installation so you control exactly which repositories Atlas can access.</p>
                <div className="dialog-actions"><button className="button button--primary" onClick={() => connect("github")} disabled={!canManageGitHub}><GitBranch size={15} /> {githubConnector ? "Update GitHub access" : "Connect GitHub"}</button><button className="button button--ghost" onClick={() => connect("notion")}>N · Notion preview</button></div>
              </>
            ) : (
              <>
                <span>Source settings</span><h2>{dialog === "github" ? "GitHub" : "Notion"}</h2><p>{dialog === "github" ? `Atlas is connected to ${githubConnector?.configuration.account ?? "this GitHub installation"}. Repository access is managed on GitHub.` : "Notion remains a frontend preview and will be connected in a later phase."}</p>
                <label className="field"><span>Sync cadence</span><select defaultValue="automatic"><option value="automatic">Automatic</option><option value="hourly">Every hour</option><option value="manual">Manual only</option></select></label>
                {dialog === "github" ? <button className="button button--primary" onClick={() => connect("github")} disabled={!canManageGitHub}>Manage repositories on GitHub</button> : <button className="button button--primary" onClick={() => { setNotice("Notion source preferences saved locally."); setDialog(null); }}>Save preview preferences</button>}
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}

const syncStages = [
  "starting",
  "fetching_source_revision",
  "preparing_repository_snapshot",
  "publishing_source_revision",
  "updated",
];

function syncStageLabel(stage: string) {
  return stage
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function syncTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function ActivityPage({
  initialJobs,
  workspace,
}: {
  initialJobs: AtlasSyncJob[];
  workspace: AtlasWorkspace;
}) {
  const [jobs, setJobs] = useState(initialJobs);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState<"all" | "running" | "completed">("all");
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const canSynchronize = workspace.role !== "viewer";
  const activeJob = jobs.find((job) =>
    ["queued", "running"].includes(job.status),
  );
  const visibleJobs = jobs.filter(
    (job) =>
      filter === "all" ||
      (filter === "running"
        ? ["queued", "running"].includes(job.status)
        : job.status === "completed"),
  );
  const completedJobs = jobs.filter((job) => job.status === "completed");
  const successfulJobs = completedJobs.length;
  const noChangeJobs = completedJobs.filter(
    (job) => job.result?.outcome === "no_change",
  ).length;
  const durations = completedJobs
    .filter((job) => job.startedAt && job.completedAt)
    .map(
      (job) =>
        new Date(job.completedAt as string).getTime() -
        new Date(job.startedAt as string).getTime(),
    )
    .sort((a, b) => a - b);
  const medianDuration = durations.length
    ? Math.round(durations[Math.floor(durations.length / 2)] / 1_000)
    : 0;

  async function refresh() {
    const response = await fetch(
      `/api/sync-jobs?workspaceId=${encodeURIComponent(workspace.id)}`,
      { cache: "no-store" },
    );
    if (response.ok) setJobs((await response.json()) as AtlasSyncJob[]);
  }

  useEffect(() => {
    const interval = window.setInterval(() => {
      void fetch(
        `/api/sync-jobs?workspaceId=${encodeURIComponent(workspace.id)}`,
        { cache: "no-store" },
      )
        .then((response) =>
          response.ok ? response.json() as Promise<AtlasSyncJob[]> : null,
        )
        .then((nextJobs) => {
          if (nextJobs) setJobs(nextJobs);
        });
    }, 4_000);
    return () => window.clearInterval(interval);
  }, [workspace.id]);

  async function syncAll() {
    setSyncing(true);
    setNotice("");
    const response = await fetch("/api/sync-jobs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ workspaceId: workspace.id }),
    });
    if (response.ok) {
      const queued = (await response.json()) as AtlasSyncJob[];
      setNotice(
        queued.length
          ? `${queued.length} repository synchronization job${queued.length === 1 ? "" : "s"} queued.`
          : "Connect at least one active repository before synchronizing.",
      );
      await refresh();
    } else {
      setNotice("Atlas could not queue synchronization jobs.");
    }
    setSyncing(false);
  }

  async function jobAction(jobId: string, action: "cancel" | "retry") {
    const response = await fetch(`/api/sync-jobs/${jobId}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: workspace.id }),
    });
    setNotice(
      response.ok
        ? action === "cancel"
          ? "Cancellation requested."
          : "Synchronization queued for retry."
        : `Atlas could not ${action} this synchronization job.`,
    );
    await refresh();
  }

  return (
    <>
      <PageHeader eyebrow="Repository intelligence" title="Sync activity" detail="Watch Atlas synchronize repository revisions before the indexing pipeline processes them." action={<button className="button button--primary" onClick={() => void syncAll()} disabled={syncing || !canSynchronize}><RefreshCw className={syncing ? "spin" : ""} size={15} /> {syncing ? "Queueing…" : "Sync all"}</button>} />
      {notice && <p className="action-notice" aria-live="polite">{notice}</p>}
      <div className="activity-grid">
        <section className="panel active-sync">
          <div className="panel-heading"><div><span>{activeJob ? "Current synchronization" : "Queue status"}</span><h2>{activeJob ? `${activeJob.repositoryOwner}/${activeJob.repositoryName}` : "No active jobs"}</h2></div>{activeJob && <span className="running-badge"><RefreshCw className={activeJob.status === "running" ? "spin" : ""} size={13} /> {activeJob.cancelRequestedAt ? "Cancelling" : syncStageLabel(activeJob.status)}</span>}</div>
          <div className="sync-progress"><div><span>{activeJob ? syncStageLabel(activeJob.stage) : "Ready for the next repository update"}</span><b>{activeJob?.progress ?? 0}%</b></div><div className="progress-track"><i style={{ width: `${activeJob?.progress ?? 0}%` }} /></div><p>{activeJob ? `Attempt ${Math.max(activeJob.attempt, 1)} · queued ${syncTime(activeJob.createdAt)}` : "Synchronization jobs will appear here as soon as they are queued."}</p></div>
          <div className="sync-stages">{syncStages.map((step, index) => { const currentIndex = activeJob ? Math.max(syncStages.indexOf(activeJob.stage), 0) : -1; return <div className={index < currentIndex ? "done" : index === currentIndex ? "current" : ""} key={step}><i>{index < currentIndex ? <Check size={12} /> : index + 1}</i><span>{syncStageLabel(step)}</span></div>; })}</div>
          {activeJob && canSynchronize && <div className="settings-actions"><button className="button button--ghost" onClick={() => void jobAction(activeJob.id, "cancel")} disabled={Boolean(activeJob.cancelRequestedAt)}>Cancel synchronization</button></div>}
        </section>
        <section className="panel activity-stats"><div><span>Successful syncs</span><strong>{successfulJobs}</strong><p>{jobs.length ? `${Math.round((successfulJobs / jobs.length) * 100)}% of recent jobs` : "No jobs yet"}</p></div><div><span>Median duration</span><strong>{medianDuration}s</strong><p>across completed jobs</p></div><div><span>No-change syncs</span><strong>{noChangeJobs}</strong><p>work safely skipped</p></div></section>
      </div>
      <section className="panel activity-log">
        <div className="panel-heading"><div><span>Workspace events</span><h2>Recent activity</h2></div><div className="activity-filters"><Filter size={14} />{(["all", "running", "completed"] as const).map((item) => <button className={filter === item ? "active" : ""} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div></div>
        <div className="timeline">{visibleJobs.map((job) => <div key={job.id}><StatusDot state={job.status === "running" || job.status === "queued" ? "running" : "ready"} /><span>{syncTime(job.createdAt)}</span><p><b>{job.repositoryOwner}/{job.repositoryName}</b><small>{syncStageLabel(job.status)} · {syncStageLabel(job.stage)}</small></p><button onClick={() => setSelectedEvent(selectedEvent === job.id ? null : job.id)}>{selectedEvent === job.id ? "Hide" : "Details"}</button>{selectedEvent === job.id && <small className="timeline-detail">{job.errorMessage ?? `${job.result?.outcome === "no_change" ? "No source changes detected" : "Repository revision synchronized"}${job.result?.revision ? ` · ${job.result.revision.slice(0, 12)}` : ""}`}{job.status === "failed" && canSynchronize && <button className="button button--ghost" onClick={() => void jobAction(job.id, "retry")}>Retry</button>}</small>}</div>)}</div>
        {visibleJobs.length === 0 && <div className="empty-state"><RefreshCw size={20} /><h2>No synchronization jobs</h2><p>Queue a sync to start tracking repository freshness.</p></div>}
      </section>
    </>
  );
}

const settingsSections = ["Workspace", "Members", "Access & roles", "Notifications", "Data & privacy"];

export function SettingsPage() {
  const [section, setSection] = useState("Workspace");
  const [saved, setSaved] = useState(false);

  return (
    <>
      <PageHeader eyebrow="Workspace administration" title="Settings" detail="Manage Northstar Labs, its members, access, and Atlas preferences." />
      {saved && <p className="action-notice" aria-live="polite">{section} settings saved locally.</p>}
      <div className="settings-layout">
        <aside>{settingsSections.map((item) => <button className={section === item ? "active" : ""} onClick={() => { setSection(item); setSaved(false); }} key={item}>{item === "Members" ? <Users size={15} /> : item === "Access & roles" ? <ShieldCheck size={15} /> : item === "Notifications" ? <Bell size={15} /> : item === "Data & privacy" ? <Database size={15} /> : <Settings size={15} />}{item}</button>)}</aside>
        <main className="panel settings-panel">
          <span>Configuration</span><h2>{section}</h2><p>Configure how this part of the Atlas workspace behaves for your engineering team.</p>
          <div className="settings-form">
            <label className="field"><span>{section} name</span><input defaultValue={section === "Workspace" ? "Northstar Labs" : `${section} preferences`} /></label>
            <label className="field"><span>Default analysis scope</span><select defaultValue="workspace"><option value="workspace">Entire workspace</option><option value="repository">Current repository</option><option value="team">Owned by my team</option></select></label>
            <div className="setting-toggle"><div><b>Show inferred relationships</b><p>Include low-confidence semantic relationships in graph views.</p></div><label><input type="checkbox" defaultChecked /><span /></label></div>
            <div className="setting-toggle"><div><b>Weekly intelligence digest</b><p>Send architecture and knowledge changes every Monday.</p></div><label><input type="checkbox" defaultChecked /><span /></label></div>
          </div>
          <div className="settings-actions"><button className="button button--primary" onClick={() => setSaved(true)}>Save changes</button></div>
        </main>
      </div>
    </>
  );
}
