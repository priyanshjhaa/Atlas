"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Check, Database, Filter, GitBranch, Plus, RefreshCw, Search, Settings, ShieldCheck, Users, X } from "lucide-react";
import { ConfidenceBadge } from "@/components/brand";
import { PageHeader, StatusDot } from "@/components/app/shared";
import type {
  AtlasGitHubConnector,
  AtlasNotionConnector,
  AtlasNotionResource,
  AtlasNotionSyncJob,
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
  notionConnectors,
  notionResources,
  repositories,
  workspace,
}: {
  githubConnectors: AtlasGitHubConnector[];
  notionConnectors: AtlasNotionConnector[];
  notionResources: AtlasNotionResource[];
  repositories: AtlasRepository[];
  workspace: AtlasWorkspace;
}) {
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<
    "connect" | "github" | "notion" | null
  >(null);
  const [notice, setNotice] = useState("");
  const [selectedNotionResources, setSelectedNotionResources] = useState(
    notionResources
      .filter((resource) => resource.isSelected && resource.isActive)
      .map((resource) => resource.id),
  );
  const [savingNotion, setSavingNotion] = useState(false);

  const visibleRepositories = useMemo(
    () => repositories.filter((repo) => repo.name.toLowerCase().includes(query.toLowerCase())),
    [query, repositories],
  );
  const githubConnector = githubConnectors.find(
    (connector) => connector.status === "active",
  );
  const notionConnector = notionConnectors.find(
    (connector) => connector.status === "active",
  );
  const canManageGitHub = ["owner", "admin"].includes(workspace.role);
  const canManageNotion = canManageGitHub;
  const activeNotionResources = notionResources.filter(
    (resource) => resource.isActive,
  );
  const notionPages = activeNotionResources.filter(
    (resource) => resource.kind === "page",
  );
  const notionDataSources = activeNotionResources.filter(
    (resource) => resource.kind !== "page",
  );
  const notionLastSyncedAt =
    activeNotionResources
      .map((resource) => resource.lastSyncedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;
  const synchronizedRepositories = repositories.filter(
    (repository) => repository.lastSyncedAt,
  );
  const lastSynchronizedAt = synchronizedRepositories
    .map((repository) => repository.lastSyncedAt as string)
    .sort()
    .at(-1) ?? null;

  function connectGitHub() {
    window.location.assign(
      `/api/github/install?workspaceId=${encodeURIComponent(workspace.id)}`,
    );
  }

  function connectNotion() {
    window.location.assign(
      `/api/notion/install?workspaceId=${encodeURIComponent(workspace.id)}`,
    );
  }

  async function saveNotionSelection() {
    setSavingNotion(true);
    const response = await fetch("/api/notion/resources", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: workspace.id,
        resourceIds: selectedNotionResources,
      }),
    });
    setNotice(
      response.ok
        ? `${selectedNotionResources.length} Notion resource${selectedNotionResources.length === 1 ? "" : "s"} selected for indexing.`
        : "Atlas could not update the Notion selection.",
    );
    setSavingNotion(false);
    if (response.ok) setDialog(null);
  }

  async function disconnectNotion() {
    setSavingNotion(true);
    const response = await fetch("/api/notion/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: workspace.id }),
    });
    if (response.ok) window.location.reload();
    else {
      setNotice("Atlas could not disconnect Notion.");
      setSavingNotion(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Approved engineering context" title="Sources" detail="Connect a GitHub App installation and a Notion workspace, choose the repositories and shared resources Atlas may access, and monitor the indexed revision and freshness of each source." action={<button className="button button--primary" onClick={() => setDialog("connect")}><Plus size={15} /> Connect source</button>} />
      {notice && <p className="action-notice" aria-live="polite">{notice}</p>}

      <div className="connector-grid">
        <article className="connector-card">
          <div className="connector-top"><i><GitBranch size={22} /></i><ConfidenceBadge type="observed" /></div>
          <h2>GitHub</h2>
          <p>Selected repositories, default-branch source, bounded commit history, pull requests, authors, and reviews for {workspace.name}.</p>
          <div className="connector-stats"><div><b>{repositories.length}</b><span>repositories</span></div><div><b>{synchronizedRepositories.length}</b><span>synchronized</span></div><div><b>{lastSynchronizedAt ? formatLastSync(lastSynchronizedAt) : "—"}</b><span>last sync</span></div></div>
          <div className="connector-footer"><StatusDot state={githubConnector ? "ready" : "warning"} /><b>{githubConnector ? `Connected to ${githubConnector.configuration.account ?? "GitHub"}` : "Not connected"}</b><button onClick={() => githubConnector ? setDialog("github") : connectGitHub()} disabled={!canManageGitHub}>{githubConnector ? "Manage" : "Connect"}</button></div>
        </article>
        <article className="connector-card">
          <div className="connector-top"><i className="notion-icon">N</i><ConfidenceBadge type="observed" /></div>
          <h2>Notion</h2>
          <p>Selected pages and data sources containing specifications, ADRs, runbooks, technical designs, and operational knowledge.</p>
          <div className="connector-stats"><div><b>{notionPages.length}</b><span>pages</span></div><div><b>{notionDataSources.length}</b><span>data sources</span></div><div><b>{notionLastSyncedAt ? formatLastSync(notionLastSyncedAt) : "—"}</b><span>last sync</span></div></div>
          <div className="connector-footer"><StatusDot state={notionConnector ? "ready" : "warning"} /><b>{notionConnector ? `Connected to ${notionConnector.configuration.workspaceName ?? "Notion"}` : "Not connected"}</b><button onClick={() => notionConnector ? setDialog("notion") : connectNotion()} disabled={!canManageNotion}>{notionConnector ? "Manage" : "Connect"}</button></div>
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
                <span>Connect context</span><h2>Choose a source</h2><p>GitHub and Notion use dedicated authorization flows so you control exactly what Atlas can access.</p>
                <div className="dialog-actions"><button className="button button--primary" onClick={connectGitHub} disabled={!canManageGitHub}><GitBranch size={15} /> {githubConnector ? "Update GitHub access" : "Connect GitHub"}</button><button className="button button--ghost" onClick={connectNotion} disabled={!canManageNotion}>N · {notionConnector ? "Update Notion access" : "Connect Notion"}</button></div>
              </>
            ) : dialog === "github" ? (
              <>
                <span>Source settings</span><h2>GitHub</h2><p>{`Atlas is connected to ${githubConnector?.configuration.account ?? "this GitHub installation"}. Repository access is managed on GitHub.`}</p>
                <label className="field"><span>Sync cadence</span><select defaultValue="automatic"><option value="automatic">Automatic</option><option value="hourly">Every hour</option><option value="manual">Manual only</option></select></label>
                <button className="button button--primary" onClick={connectGitHub} disabled={!canManageGitHub}>Manage repositories on GitHub</button>
              </>
            ) : (
              <>
                <span>Source settings</span><h2>Notion</h2><p>{`Atlas can access ${activeNotionResources.length} resources in ${notionConnector?.configuration.workspaceName ?? "this Notion workspace"}. Choose which ones should be indexed.`}</p>
                <div className="notion-resource-list">
                  {activeNotionResources.map((resource) => (
                    <label className="notion-resource-option" key={resource.id}>
                      <input
                        type="checkbox"
                        checked={selectedNotionResources.includes(resource.id)}
                        onChange={(event) =>
                          setSelectedNotionResources((current) =>
                            event.target.checked
                              ? [...current, resource.id]
                              : current.filter((id) => id !== resource.id),
                          )
                        }
                      />
                      <span><b>{resource.title}</b><small>{resource.kind.replace("_", " ")}</small></span>
                    </label>
                  ))}
                  {activeNotionResources.length === 0 && <p>No shared Notion pages are visible yet. Share a page with the Atlas connection, then reconnect.</p>}
                </div>
                <div className="dialog-actions">
                  <button className="button button--primary" onClick={saveNotionSelection} disabled={savingNotion || !canManageNotion}>{savingNotion ? "Saving…" : "Save selection"}</button>
                  <button className="button button--ghost" onClick={connectNotion} disabled={savingNotion || !canManageNotion}>Refresh access</button>
                  <button className="button button--ghost" onClick={disconnectNotion} disabled={savingNotion || !canManageNotion}>Disconnect</button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}

const syncStages = [
  "fetching_source_revision",
  "fetching_repository_history",
  "downloading_repository_archive",
  "discovering_source_files",
  "parsing_and_embedding",
  "persisting_intelligence_graph",
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
  initialNotionJobs,
  workspace,
  initialSource = "all",
}: {
  initialJobs: AtlasSyncJob[];
  initialNotionJobs: AtlasNotionSyncJob[];
  workspace: AtlasWorkspace;
  initialSource?: "all" | "github" | "notion";
}) {
  const [jobs, setJobs] = useState(initialJobs);
  const [notionJobs, setNotionJobs] = useState(initialNotionJobs);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState<"all" | "running" | "completed">("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | "github" | "notion">(initialSource);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const canSynchronize = workspace.role !== "viewer";
  const activityJobs = [
    ...jobs.map((job) => ({ ...job, source: "github" as const })),
    ...notionJobs.map((job) => ({ ...job, source: "notion" as const })),
  ].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
  const sourceJobs = activityJobs.filter((job) => sourceFilter === "all" || job.source === sourceFilter);
  const activeJob = sourceJobs.find((job) =>
    ["queued", "running"].includes(job.status),
  );
  const visibleJobs = sourceJobs.filter(
    (job) =>
      filter === "all" ||
      (filter === "running"
        ? ["queued", "running"].includes(job.status)
        : job.status === "completed"),
  );
  const completedJobs = sourceJobs.filter(
    (job) => job.status === "completed",
  );
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

  const refresh = useCallback(async () => {
    const [githubResponse, notionResponse] = await Promise.all([
      fetch(`/api/sync-jobs?workspaceId=${encodeURIComponent(workspace.id)}`, {
        cache: "no-store",
      }),
      fetch(
        `/api/notion/sync-jobs?workspaceId=${encodeURIComponent(workspace.id)}`,
        { cache: "no-store" },
      ),
    ]);
    if (githubResponse.ok) {
      setJobs((await githubResponse.json()) as AtlasSyncJob[]);
    }
    if (notionResponse.ok) {
      setNotionJobs((await notionResponse.json()) as AtlasNotionSyncJob[]);
    }
  }, [workspace.id]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refresh();
    }, 4_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  async function syncAll() {
    setSyncing(true);
    setNotice("");
    const headers = {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    };
    const [githubResponse, notionResponse] = await Promise.all([
      fetch("/api/sync-jobs", {
        method: "POST",
        headers,
        body: JSON.stringify({ workspaceId: workspace.id }),
      }),
      fetch("/api/notion/sync-jobs", {
        method: "POST",
        headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ workspaceId: workspace.id }),
      }),
    ]);
    if (githubResponse.ok || notionResponse.ok) {
      const githubQueued = githubResponse.ok
        ? ((await githubResponse.json()) as AtlasSyncJob[])
        : [];
      const notionQueued = notionResponse.ok
        ? ((await notionResponse.json()) as AtlasNotionSyncJob[])
        : [];
      const queued = githubQueued.length + notionQueued.length;
      setNotice(
        queued
          ? `${queued} source synchronization job${queued === 1 ? "" : "s"} queued.`
          : "Connect at least one active source before synchronizing.",
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
      <PageHeader eyebrow="Source ingestion and freshness" title="Sync activity" detail="Track GitHub revision checks, bounded history capture, source discovery, parsing, embeddings, graph persistence, and Notion document versioning. Cancel active repository jobs, retry failures, and verify no-change work that Atlas safely skipped." action={<button className="button button--primary" onClick={() => void syncAll()} disabled={syncing || !canSynchronize}><RefreshCw className={syncing ? "spin" : ""} size={15} /> {syncing ? "Queueing…" : "Sync all"}</button>} />
      {notice && <p className="action-notice" aria-live="polite">{notice}</p>}
      <nav className="context-source-switch" aria-label="Activity source">
        <span>Inspect activity for</span>
        {(["github", "notion", "all"] as const).map((source) => <button className={sourceFilter === source ? "active" : ""} onClick={() => setSourceFilter(source)} key={source}>{source === "all" ? "All context" : source === "github" ? "GitHub changes" : "Notion changes"}</button>)}
      </nav>
      <div className="activity-grid">
        <section className="panel active-sync">
          <div className="panel-heading"><div><span>{activeJob ? "Current synchronization" : "Queue status"}</span><h2>{activeJob ? activeJob.source === "github" ? `${activeJob.repositoryOwner}/${activeJob.repositoryName}` : activeJob.configuration.workspaceName ?? "Notion" : "No active jobs"}</h2></div>{activeJob && <span className="running-badge"><RefreshCw className={activeJob.status === "running" ? "spin" : ""} size={13} /> {activeJob.source === "github" && activeJob.cancelRequestedAt ? "Cancelling" : syncStageLabel(activeJob.status)}</span>}</div>
          <div className="sync-progress"><div><span>{activeJob ? syncStageLabel(activeJob.stage) : "Ready for the next repository update"}</span><b>{activeJob?.progress ?? 0}%</b></div><div className="progress-track"><i style={{ width: `${activeJob?.progress ?? 0}%` }} /></div><p>{activeJob ? `Attempt ${Math.max(activeJob.attempt, 1)} · queued ${syncTime(activeJob.createdAt)}` : "Synchronization jobs will appear here as soon as they are queued."}</p></div>
          <div className="sync-stages">{syncStages.map((step, index) => { const progress = activeJob?.progress ?? -1; const currentIndex = progress >= 90 ? 5 : progress >= 52 ? 4 : progress >= 32 ? 3 : progress >= 15 ? 2 : progress >= 8 ? 1 : progress >= 0 ? 0 : -1; return <div className={index < currentIndex ? "done" : index === currentIndex ? "current" : ""} key={step}><i>{index < currentIndex ? <Check size={12} /> : index + 1}</i><span>{syncStageLabel(step)}</span></div>; })}</div>
          {activeJob?.source === "github" && canSynchronize && <div className="settings-actions"><button className="button button--ghost" onClick={() => void jobAction(activeJob.id, "cancel")} disabled={Boolean(activeJob.cancelRequestedAt)}>Cancel synchronization</button></div>}
        </section>
        <section className="panel activity-stats"><div><span>Successful syncs</span><strong>{successfulJobs}</strong><p>{sourceJobs.length ? `${Math.round((successfulJobs / sourceJobs.length) * 100)}% of recent jobs` : "No jobs yet"}</p></div><div><span>Median duration</span><strong>{medianDuration}s</strong><p>across completed jobs</p></div><div><span>No-change syncs</span><strong>{noChangeJobs}</strong><p>work safely skipped</p></div></section>
      </div>
      <section className="panel activity-log">
        <div className="panel-heading"><div><span>Workspace events</span><h2>Recent activity</h2></div><div className="activity-filters"><Filter size={14} />{(["all", "running", "completed"] as const).map((item) => <button className={filter === item ? "active" : ""} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div></div>
        <div className="timeline">{visibleJobs.map((job) => <div key={`${job.source}-${job.id}`}><StatusDot state={job.status === "running" || job.status === "queued" ? "running" : "ready"} /><span>{syncTime(job.createdAt)}</span><p><b>{job.source === "github" ? `${job.repositoryOwner}/${job.repositoryName}` : job.configuration.workspaceName ?? "Notion"}</b><small>{job.source === "github" ? "GitHub" : "Notion"} · {syncStageLabel(job.status)} · {syncStageLabel(job.stage)}</small></p><button onClick={() => setSelectedEvent(selectedEvent === job.id ? null : job.id)}>{selectedEvent === job.id ? "Hide" : "Details"}</button>{selectedEvent === job.id && <small className="timeline-detail">{job.errorMessage ?? (job.result?.outcome === "no_change" ? "No source changes detected" : job.source === "github" ? `${job.result?.filesIndexed ?? 0} files · ${job.result?.symbolsExtracted ?? 0} symbols · ${job.result?.relationshipsExtracted ?? 0} relationships${job.result?.revision ? ` · ${job.result.revision.slice(0, 12)}` : ""}` : `${job.result?.documentsUpdated ?? 0} documents · ${job.result?.versionsCreated ?? 0} versions · ${job.result?.documentsSkipped ?? 0} unchanged`)}{job.source === "github" && job.status === "failed" && canSynchronize && <button className="button button--ghost" onClick={() => void jobAction(job.id, "retry")}>Retry</button>}</small>}</div>)}</div>
        {visibleJobs.length === 0 && <div className="empty-state"><RefreshCw size={20} /><h2>No synchronization jobs</h2><p>Queue a sync to start tracking source freshness.</p></div>}
      </section>
    </>
  );
}

export function SettingsPage({
  workspace,
}: {
  workspace: AtlasWorkspace;
}) {
  return (
    <>
      <PageHeader eyebrow="Workspace administration" title="Settings" detail={`Review the live workspace identity, repository coverage, and your role-based access level for ${workspace.name}. Connector permissions and indexed data remain controlled from Sources.`} />
      <div className="settings-layout">
        <aside><button className="active"><Settings size={15} />Workspace</button><button disabled><Users size={15} />Members</button><button disabled><ShieldCheck size={15} />Access & roles</button><button disabled><Bell size={15} />Notifications</button><button disabled><Database size={15} />Data & privacy</button></aside>
        <main className="panel settings-panel">
          <span>Live configuration</span><h2>{workspace.name}</h2><p>These values come from the authenticated Atlas workspace and determine the scope used by repositories, connectors, synchronization, search, graphs, and impact reports.</p>
          <div className="settings-form">
            <div className="entity-meta"><div><span>Name</span><b>{workspace.name}</b></div><div><span>Slug</span><b>{workspace.slug}</b></div><div><span>Your role</span><b>{workspace.role}</b></div><div><span>Repositories</span><b>{workspace.repositoryCount}</b></div></div>
          </div>
        </main>
      </div>
    </>
  );
}
