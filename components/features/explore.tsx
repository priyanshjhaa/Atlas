"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  ArrowDownLeft,
  ArrowUpRight,
  BookOpen,
  Boxes,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Code2,
  FileCode2,
  FileText,
  Filter,
  GitFork,
  Layers3,
  Map as MapIcon,
  Network,
  RefreshCw,
  Route,
  Search,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { AtlasGraph } from "@/components/atlas-graph";
import { ConfidenceBadge } from "@/components/brand";
import { PageHeader } from "@/components/app/shared";
import type {
  AtlasArchitectureSnapshot,
  AtlasGraph as AtlasGraphData,
  AtlasWorkspaceIntelligenceSearchResponse,
  AtlasRepository,
  AtlasWorkspace,
} from "@/lib/api-types";

function readable(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function graphRepositoryLabel(
  node: AtlasGraphData["nodes"][number],
  repositories: AtlasRepository[],
) {
  if (node.repository) return node.repository;
  if (node.repositoryOwner && node.repositoryName) {
    return `${node.repositoryOwner}/${node.repositoryName}`;
  }
  const repository = repositories.find((item) => item.id === node.repositoryId);
  return repository ? `${repository.owner}/${repository.name}` : "Repository unavailable";
}

function relationshipLabel(kind: string, incoming: boolean) {
  const labels: Record<string, [string, string]> = {
    contains: ["Part of", "Contains"],
    declares: ["Declared by", "Declares"],
    imports: ["Used by", "Uses"],
    depends_on: ["Used by", "Depends on"],
    references_symbol: ["Referenced by", "References"],
    calls_api: ["Called by", "Calls"],
    imports_api: ["API used by", "Uses API"],
  };
  return (labels[kind] ?? ["Connected from", "Connects to"])[incoming ? 0 : 1];
}

function DependencyLane({
  title,
  description,
  edges,
  selectedNode,
  nodeById,
  onSelect,
  incoming,
}: {
  title: string;
  description: string;
  edges: AtlasGraphData["edges"];
  selectedNode: AtlasGraphData["nodes"][number];
  nodeById: Map<string, AtlasGraphData["nodes"][number]>;
  onSelect: (nodeId: string) => void;
  incoming: boolean;
}) {
  const DirectionIcon = incoming ? ArrowDownLeft : ArrowUpRight;
  return (
    <section className={`dependency-lane dependency-lane--${incoming ? "incoming" : "outgoing"}`}>
      <header>
        <div><DirectionIcon size={16} /></div>
        <div><h3>{title}</h3><p>{description}</p></div>
        <b>{edges.length}</b>
      </header>
      <div className="dependency-lane__items">
        {edges.slice(0, 6).map((edge) => {
          const counterpartId = incoming ? edge.sourceEntityId : edge.targetEntityId;
          const counterpart = nodeById.get(counterpartId);
          return (
            <button type="button" onClick={() => onSelect(counterpartId)} key={edge.id}>
              <i>{relationshipLabel(edge.kind, incoming)}</i>
              <span>
                <strong>{counterpart?.name ?? "Connected entity"}</strong>
                <small>{counterpart ? readable(counterpart.entityType) : "Entity"}{edge.classification === "inferred" ? " · Suggested" : ""}</small>
              </span>
              <ChevronRight size={14} />
            </button>
          );
        })}
        {edges.length > 6 && <p className="dependency-lane__more">+{edges.length - 6} more relationships in the full map</p>}
        {!edges.length && (
          <p className="dependency-lane__empty">
            {incoming
              ? `Nothing relies on ${selectedNode.name} in this view.`
              : `${selectedNode.name} does not rely on anything in this view.`}
          </p>
        )}
      </div>
    </section>
  );
}

export function GraphPage({
  workspace,
  repositories,
  graph,
  selectedRepositoryId,
  traversal,
}: {
  workspace: AtlasWorkspace;
  repositories: AtlasRepository[];
  graph: AtlasGraphData | null;
  selectedRepositoryId: string;
  traversal: {
    depth: 1 | 2 | 3;
    direction: "incoming" | "outgoing" | "both";
    includeHistorical: boolean;
    includeInferred: boolean;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [entityType, setEntityType] = useState("all");
  const [classification, setClassification] = useState<
    "all" | "observed" | "historical" | "inferred"
  >("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"story" | "map">("story");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    graph?.rootEntityId ?? null,
  );
  const [isRefreshing, startRefresh] = useTransition();
  const availableRepositories = repositories.filter(
    (repository) => repository.isActive && repository.lastSyncedAt,
  );

  function updateLocation(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    startRefresh(() => router.replace(`${pathname}?${params.toString()}`));
  }

  const entityTypes = useMemo(
    () => [
      "all",
      ...new Set((graph?.nodes ?? []).map((node) => node.entityType)),
    ],
    [graph],
  );
  const visibleGraph = useMemo(() => {
    if (!graph) return null;
    const normalized = query.trim().toLowerCase();
    const nodes = graph.nodes.filter(
      (node) =>
        (entityType === "all" || node.entityType === entityType) &&
        (!normalized ||
          `${node.name} ${node.path ?? ""} ${graphRepositoryLabel(node, repositories)}`
            .toLowerCase()
            .includes(normalized)),
    );
    const nodeIds = new Set(nodes.map((node) => node.id));
    return {
      ...graph,
      nodes,
      edges: graph.edges.filter(
        (edge) =>
          nodeIds.has(edge.sourceEntityId) &&
          nodeIds.has(edge.targetEntityId) &&
          (classification === "all" ||
            edge.classification === classification),
      ),
    };
  }, [classification, entityType, graph, query, repositories]);
  const selectedNode =
    visibleGraph?.nodes.find((node) => node.id === selectedNodeId) ??
    visibleGraph?.nodes.find((node) => node.id === graph?.rootEntityId) ??
    visibleGraph?.nodes[0] ??
    null;
  const selectedRelationships = selectedNode
    ? (visibleGraph?.edges ?? []).filter(
        (edge) =>
          edge.sourceEntityId === selectedNode.id ||
          edge.targetEntityId === selectedNode.id,
      )
    : [];
  const nodeById = new Map((visibleGraph?.nodes ?? []).map((node) => [node.id, node]));
  const incomingRelationships = selectedNode
    ? selectedRelationships.filter((edge) => edge.targetEntityId === selectedNode.id)
    : [];
  const outgoingRelationships = selectedNode
    ? selectedRelationships.filter((edge) => edge.sourceEntityId === selectedNode.id)
    : [];

  return (
    <div className="explore-page explore-page--graph engineering-explorer">
      <header className="explore-intro">
        <div className="explore-intro__copy">
          <span>Engineering knowledge graph</span>
          <h1>Trace how {workspace.name} works</h1>
          <p>
            {graph
              ? `Choose an item to see what relies on it and what it relies on. ${graph.nodes.length} source-backed ${graph.nodes.length === 1 ? "item" : "items"} are connected by ${graph.edges.length} ${graph.edges.length === 1 ? "relationship" : "relationships"}.`
              : "Synchronize a GitHub repository to resolve packages, files, symbols, imports, API relationships, and cross-repository paths into a source-backed graph."}
          </p>
        </div>
        <div className="explore-intro__telemetry">
          <div><strong>{visibleGraph?.nodes.length ?? 0}</strong><span>entities in view</span></div>
          <div><strong>{visibleGraph?.edges.length ?? 0}</strong><span>relationships</span></div>
          <button
            className="button button--ghost"
            onClick={() => startRefresh(() => router.refresh())}
            disabled={isRefreshing}
          >
            <RefreshCw className={isRefreshing ? "spin" : ""} size={14} />
            {isRefreshing ? "Loading map…" : "Refresh graph"}
          </button>
        </div>
      </header>

      <div className="graph-command-bar">
        <label className="graph-repository-select">
          <span>Repository</span>
          <select
            value={selectedRepositoryId}
            onChange={(event) =>
              updateLocation({ repository: event.target.value, entity: null })
            }
            disabled={isRefreshing}
          >
            {availableRepositories.map((repository) => (
              <option value={repository.id} key={repository.id}>
                {repository.owner}/{repository.name}
              </option>
            ))}
          </select>
        </label>
        <label className="search-input">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Find graph entity"
            placeholder="Find an indexed repository, package, file, or symbol…"
          />
        </label>
        <button
          className="button button--ghost"
          onClick={() => setFiltersOpen((current) => !current)}
          aria-expanded={filtersOpen}
        >
          <Filter size={14} /> Filters
        </button>
      </div>

      <details className="graph-advanced-controls">
        <summary>
          <span><b>Advanced graph controls</b><small>Depth, direction, suggested paths, and history</small></span>
          <ChevronRight size={16} />
        </summary>
        <div className="graph-scope-bar" aria-label="Graph traversal controls">
        <div>
          <span>Depth</span>
          {[1, 2, 3].map((depth) => (
            <button
              className={traversal.depth === depth ? "active" : ""}
              onClick={() => updateLocation({ depth: String(depth), entity: null })}
              disabled={isRefreshing}
              key={depth}
            >
              {depth} hop{depth === 1 ? "" : "s"}
            </button>
          ))}
        </div>
        <div>
          <span>Direction</span>
          {(["incoming", "both", "outgoing"] as const).map((direction) => (
            <button
              className={traversal.direction === direction ? "active" : ""}
              onClick={() => updateLocation({ direction, entity: null })}
              disabled={isRefreshing}
              key={direction}
            >
              {readable(direction)}
            </button>
          ))}
        </div>
        <label className="graph-switch">
          <input
            type="checkbox"
            checked={traversal.includeInferred}
            onChange={(event) =>
              updateLocation({ inferred: String(event.target.checked), entity: null })
            }
          />
          <span /> Inferred paths
        </label>
        <label className="graph-switch">
          <input
            type="checkbox"
            checked={traversal.includeHistorical}
            onChange={(event) =>
              updateLocation({ historical: String(event.target.checked), entity: null })
            }
          />
          <span /> History
        </label>
        </div>
      </details>

      {filtersOpen && (
        <div className="inline-filter-panel">
          <div>
            <span>Entity type</span>
            {entityTypes.map((item) => (
              <button
                className={entityType === item ? "active" : ""}
                onClick={() => setEntityType(item)}
                key={item}
              >
                {item === "all" ? "All entities" : readable(item)}
              </button>
            ))}
          </div>
          <div>
            <span>Relationship</span>
            {(["all", "observed", "historical", "inferred"] as const).map(
              (item) => (
                <button
                  className={classification === item ? "active" : ""}
                  onClick={() => setClassification(item)}
                  key={item}
                >
                  {readable(item)}
                </button>
              ),
            )}
          </div>
        </div>
      )}

      <div className={`graph-layout graph-layout--${viewMode}`}>
        <section className="panel graph-canvas">
          <header className="graph-view-toolbar">
            <div>
              <span>Viewing from</span>
              <strong>{selectedNode?.name ?? "Repository root"}</strong>
              <small>{selectedRelationships.length} connected {selectedRelationships.length === 1 ? "relationship" : "relationships"}</small>
            </div>
            <div className="graph-view-switch" aria-label="Graph view">
              <button type="button" className={viewMode === "story" ? "active" : ""} aria-pressed={viewMode === "story"} onClick={() => setViewMode("story")}>
                <CircleDot size={14} /> Simple view
              </button>
              <button type="button" className={viewMode === "map" ? "active" : ""} aria-pressed={viewMode === "map"} onClick={() => setViewMode("map")}>
                <MapIcon size={14} /> Full map
              </button>
            </div>
            {viewMode === "map" && (
              <div className="graph-legend" aria-label="Relationship legend">
                <span><i className="observed" /> Observed</span>
                <span><i className="inferred" /> Suggested</span>
              </div>
            )}
          </header>
          {viewMode === "map" ? (
            <AtlasGraph
              graph={visibleGraph}
              selectedNodeId={selectedNode?.id}
              onNodeSelect={setSelectedNodeId}
            />
          ) : selectedNode ? (
            <div className="dependency-story">
              <DependencyLane
                title="What uses this"
                description="Items that rely on the focus"
                edges={incomingRelationships}
                selectedNode={selectedNode}
                nodeById={nodeById}
                onSelect={setSelectedNodeId}
                incoming
              />
              <section className="dependency-focus" aria-label={`Current focus: ${selectedNode.name}`}>
                <div className="dependency-focus__pulse"><CircleDot size={20} /></div>
                <span>{readable(selectedNode.entityType)}</span>
                <h2>{selectedNode.name}</h2>
                <p>{selectedNode.path ?? graphRepositoryLabel(selectedNode, repositories)}</p>
                <div className="dependency-focus__summary">
                  <div><strong>{incomingRelationships.length}</strong><span>use this</span></div>
                  <i><ArrowRight size={18} /></i>
                  <div><strong>{outgoingRelationships.length}</strong><span>this uses</span></div>
                </div>
                <small>Select any item beside this card to follow its story.</small>
                <div className="dependency-focus__actions">
                  {selectedNode.id !== graph?.rootEntityId && (
                    <button className="button button--secondary" onClick={() => updateLocation({ entity: selectedNode.id })} disabled={isRefreshing}>
                      Explore from here
                    </button>
                  )}
                  <Link href={`/app/impact/new?repository=${selectedNode.repositoryId}`} className="button button--primary">
                    Analyze a change <ArrowRight size={14} />
                  </Link>
                </div>
              </section>
              <DependencyLane
                title="What this uses"
                description="Items the focus relies on"
                edges={outgoingRelationships}
                selectedNode={selectedNode}
                nodeById={nodeById}
                onSelect={setSelectedNodeId}
                incoming={false}
              />
            </div>
          ) : (
            <div className="empty-state"><Network size={20} /><h2>No relationships in view</h2></div>
          )}
        </section>
        {viewMode === "map" && <aside className="panel entity-inspector">
          {selectedNode ? (
            <>
              <div className="entity-icon">
                <ShieldCheck size={20} />
              </div>
              <span>
                {readable(selectedNode.entityType)} ·{" "}
                {selectedNode.isCurrent ? "current" : "historical"}
              </span>
              <h2>{selectedNode.name}</h2>
              <p>
                {selectedNode.path ??
                  graphRepositoryLabel(selectedNode, repositories)}
              </p>
              <div className="entity-meta">
                <div>
                  <span>Repository</span>
                  <b>
                    {graphRepositoryLabel(selectedNode, repositories)}
                  </b>
                </div>
                <div>
                  <span>Revision</span>
                  <b>{selectedNode.sourceRevision.slice(0, 12)}</b>
                </div>
                <div>
                  <span>Relationships</span>
                  <b>{selectedRelationships.length}</b>
                </div>
                <div>
                  <span>Graph role</span>
                  <b>{selectedNode.id === graph?.rootEntityId ? "Traversal root" : "Connected entity"}</b>
                </div>
              </div>
              <details className="relationship-disclosure" open>
                <summary>
                  Connected relationships
                  <span>{selectedRelationships.length}</span>
                </summary>
                <div className="relationship-list">
                  {selectedRelationships.slice(0, 6).map((edge) => (
                    <button
                      type="button"
                      onClick={() => {
                        const counterpart = edge.sourceEntityId === selectedNode.id
                          ? edge.targetEntityId
                          : edge.sourceEntityId;
                        setSelectedNodeId(counterpart);
                      }}
                      key={edge.id}
                    >
                      <span>
                        <b>{readable(edge.kind)}</b>
                        <small>{nodeById.get(edge.sourceEntityId === selectedNode.id ? edge.targetEntityId : edge.sourceEntityId)?.name ?? "Connected entity"}</small>
                      </span>
                      <i>{Math.round(edge.confidence * 100)}%</i>
                    </button>
                  ))}
                  {!selectedRelationships.length && (
                    <p>No relationships match the current filters.</p>
                  )}
                </div>
              </details>
              {selectedNode.id !== graph?.rootEntityId && (
                <button
                  className="button button--secondary"
                  onClick={() => updateLocation({ entity: selectedNode.id })}
                  disabled={isRefreshing}
                >
                  <CircleDot size={14} /> Explore from this entity
                </button>
              )}
              <Link
                href={`/app/impact/new?repository=${selectedNode.repositoryId}`}
                className="button button--primary"
              >
                Analyze a change here <ArrowRight size={15} />
              </Link>
            </>
          ) : (
            <div className="empty-state">
              <Network size={20} />
              <h2>No matching graph entity</h2>
              <p>Change the filters or synchronize an active repository.</p>
            </div>
          )}
        </aside>}
      </div>
      {graph?.truncated && (
        <p className="graph-limit-note">
          This view reached the safe graph limit. Focus an entity or reduce traversal depth for a more precise map.
        </p>
      )}
    </div>
  );
}

export function ArchitecturePage({
  workspace,
  repositories,
  selectedRepositoryId,
  architectureSnapshot,
}: {
  workspace: AtlasWorkspace;
  repositories: AtlasRepository[];
  selectedRepositoryId: string;
  architectureSnapshot: AtlasArchitectureSnapshot | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isRefreshing, startRefresh] = useTransition();
  const modules = architectureSnapshot?.moduleMap.moduleNodes ?? [];
  const edges = architectureSnapshot?.moduleMap.moduleEdges ?? [];
  const stats = architectureSnapshot?.moduleMap.stats;
  const [selectedModuleId, setSelectedModuleId] = useState(modules[0]?.id ?? null);
  const selectedModule = modules.find((module) => module.id === selectedModuleId) ?? modules[0] ?? null;
  const availableRepositories = repositories.filter(
    (repository) => repository.isActive && repository.lastSyncedAt,
  );

  function selectRepository(repositoryId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("repository", repositoryId);
    startRefresh(() => router.replace(`${pathname}?${params.toString()}`));
  }

  const selectedConnections = selectedModule
    ? edges.filter((edge) => edge.from === selectedModule.id || edge.to === selectedModule.id)
    : [];
  const generatedAt = architectureSnapshot
    ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(architectureSnapshot.generatedAt),
      )
    : null;

  return (
    <div className="explore-page explore-page--architecture architecture-workspace engineering-explorer">
      <header className="explore-intro architecture-intro">
        <div className="explore-intro__copy">
          <span>Observed system architecture</span>
          <h1>Understand how {workspace.name} is assembled</h1>
          <p>
            {architectureSnapshot?.summary ??
              "Synchronize a repository to build a source-backed module map, identify entry points, and trace observed imports across the system."}
          </p>
        </div>
        <div className="architecture-provenance">
          <ShieldCheck size={18} />
          <div>
            <span>{architectureSnapshot?.moduleMap.generatedFrom.replaceAll("_", " ") ?? "Awaiting static analysis"}</span>
            <strong>{generatedAt ? `Generated ${generatedAt}` : "No snapshot available"}</strong>
          </div>
        </div>
      </header>

      <div className="architecture-command-bar">
        <label>
          <span>Repository architecture</span>
          <select
            value={selectedRepositoryId}
            onChange={(event) => selectRepository(event.target.value)}
            disabled={isRefreshing}
          >
            {availableRepositories.map((repository) => (
              <option value={repository.id} key={repository.id}>
                {repository.owner}/{repository.name}
              </option>
            ))}
          </select>
        </label>
        <div>
          <span className={`architecture-readiness architecture-readiness--${architectureSnapshot?.moduleMap.readiness ?? "partial"}`}>
            <CheckCircle2 size={13} /> {architectureSnapshot?.moduleMap.readiness ?? "Not indexed"}
          </span>
          <Link className="button button--secondary" href={`/app/graph?repository=${selectedRepositoryId}`}>
            <Network size={14} /> Open dependency graph
          </Link>
          <button
            className="button button--ghost"
            onClick={() => startRefresh(() => router.refresh())}
            disabled={isRefreshing}
          >
            <RefreshCw className={isRefreshing ? "spin" : ""} size={14} />
            {isRefreshing ? "Refreshing…" : "Refresh snapshot"}
          </button>
        </div>
      </div>

      {architectureSnapshot && stats ? (
        <>
          <section className="architecture-metrics" aria-label="Architecture coverage">
            <article><FileCode2 size={17} /><strong>{stats.filesIndexed}</strong><span>files indexed</span></article>
            <article><Code2 size={17} /><strong>{stats.symbolsExtracted}</strong><span>symbols extracted</span></article>
            <article><Route size={17} /><strong>{stats.callsDetected}</strong><span>calls detected</span></article>
            <article><GitFork size={17} /><strong>{stats.crossModuleEdges}</strong><span>module links</span></article>
          </section>

          <div className="architecture-map-layout">
            <section className="panel architecture-map-panel">
              <div className="architecture-section-heading">
                <div><span>Module atlas</span><h2>Choose an area to inspect its dependencies</h2></div>
                <small>{modules.length} observed areas</small>
              </div>
              <div className="architecture-map-root">
                <Network size={18} />
                <div><span>Repository system</span><strong>{availableRepositories.find((item) => item.id === selectedRepositoryId)?.name}</strong></div>
              </div>
              <div className="architecture-module-grid">
                {modules.map((module) => {
                  const connectionCount = edges.filter((edge) => edge.from === module.id || edge.to === module.id).length;
                  const Icon = module.kind === "service" ? Workflow : module.kind === "module" ? Boxes : Layers3;
                  return (
                    <button
                      className={selectedModule?.id === module.id ? "active" : ""}
                      onClick={() => setSelectedModuleId(module.id)}
                      aria-label={`${readable(module.kind)} ${module.label}, ${connectionCount} connection${connectionCount === 1 ? "" : "s"}`}
                      aria-pressed={selectedModule?.id === module.id}
                      key={module.id}
                    >
                      <Icon size={16} />
                      <span>{module.kind}</span>
                      <strong>{module.label}</strong>
                      <small>{connectionCount} connection{connectionCount === 1 ? "" : "s"}</small>
                    </button>
                  );
                })}
              </div>
            </section>

            <aside className="panel architecture-inspector">
              {selectedModule ? (
                <>
                  <span>{selectedModule.kind} area</span>
                  <h2>{selectedModule.label}</h2>
                  <p>{selectedModule.id}</p>
                  <div className="architecture-connection-summary">
                    <div><strong>{selectedConnections.filter((edge) => edge.from === selectedModule.id).length}</strong><span>dependencies</span></div>
                    <div><strong>{selectedConnections.filter((edge) => edge.to === selectedModule.id).length}</strong><span>consumers</span></div>
                  </div>
                  <div className="architecture-connection-list">
                    {selectedConnections.map((edge) => {
                      const incoming = edge.to === selectedModule.id;
                      const counterpartId = incoming ? edge.from : edge.to;
                      const counterpart = modules.find((module) => module.id === counterpartId);
                      return (
                        <button onClick={() => setSelectedModuleId(counterpartId)} key={`${edge.from}:${edge.to}`}>
                          <i>{incoming ? "Used by" : "Imports"}</i>
                          <span>{counterpart?.label ?? counterpartId}</span>
                          <ChevronRight size={13} />
                        </button>
                      );
                    })}
                    {!selectedConnections.length && <p>No cross-module imports were observed for this area.</p>}
                  </div>
                </>
              ) : (
                <div className="empty-state"><Boxes size={20} /><h2>No module areas</h2></div>
              )}
            </aside>
          </div>

          <div className="architecture-reading-grid">
            <section className="panel architecture-reading-panel">
              <div className="architecture-section-heading"><div><span>Start here</span><h2>System entry points</h2></div><CircleDot size={17} /></div>
              <div className="architecture-path-list">
                {architectureSnapshot.moduleMap.entryPoints.map((path, index) => (
                  <div key={path}><i>{String(index + 1).padStart(2, "0")}</i><code>{path}</code></div>
                ))}
                {!architectureSnapshot.moduleMap.entryPoints.length && <p>No conventional entry points were detected.</p>}
              </div>
            </section>
            <section className="panel architecture-reading-panel">
              <div className="architecture-section-heading"><div><span>Reading path</span><h2>Files that explain the system</h2></div><BookOpen size={17} /></div>
              <div className="architecture-path-list">
                {architectureSnapshot.moduleMap.recommendedReads.map((path, index) => (
                  <div key={path}><i>{String(index + 1).padStart(2, "0")}</i><code>{path}</code></div>
                ))}
                {!architectureSnapshot.moduleMap.recommendedReads.length && <p>No recommended files are available yet.</p>}
              </div>
            </section>
          </div>

          <footer className="architecture-evidence-note">
            <ShieldCheck size={15} />
            <span>Snapshot pinned to revision <code>{architectureSnapshot.sourceRevision.slice(0, 12)}</code>. Relationships represent observed static imports, not assumed runtime traffic.</span>
          </footer>
        </>
      ) : (
        <section className="panel architecture-empty-state">
          <Network size={25} />
          <h2>No architecture snapshot yet</h2>
          <p>Connect and synchronize an active repository. Atlas will derive modules, entry points, static imports, symbols, and a guided reading path from that revision.</p>
          <Link href="/app/sources" className="button button--primary">Open sources <ArrowRight size={14} /></Link>
        </section>
      )}
    </div>
  );
}

export function SearchPage({
  workspace,
  repositories,
  initialScope = "all",
}: {
  workspace: AtlasWorkspace;
  repositories: AtlasRepository[];
  initialScope?: "all" | "github" | "notion";
}) {
  const searchableRepositories = repositories.filter(
    (repository) => repository.isActive && repository.lastSyncedAt,
  );
  const [repositoryId, setRepositoryId] = useState(
    initialScope === "notion" ? "" : searchableRepositories[0]?.id ?? "",
  );
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"all" | "github" | "notion">(initialScope);
  const [response, setResponse] =
    useState<AtlasWorkspaceIntelligenceSearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const repositoryById = new Map(
    repositories.map((repository) => [repository.id, repository]),
  );

  async function search() {
    if (query.trim().length < 2) return;
    setSearching(true);
    setError("");
    const result = await fetch("/api/intelligence/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: workspace.id,
        ...(repositoryId ? { repositoryId } : {}),
        providers:
          scope === "all" ? ["github", "notion"] : [scope],
        query: query.trim(),
      }),
    });
    const body = (await result.json()) as
      | AtlasWorkspaceIntelligenceSearchResponse
      | { message?: string };
    if (result.ok && "results" in body) {
      setResponse(body);
    } else {
      setResponse(null);
      setError(
        "message" in body && body.message
          ? body.message
          : "Atlas could not search this repository.",
      );
    }
    setSearching(false);
  }

  return (
    <>
      <PageHeader
        eyebrow="Cited engineering retrieval"
        title={`Search ${workspace.name}`}
        detail="Search synchronized source chunks, files, symbols, packages, and public APIs. Atlas ranks direct matches, expands relevant current graph neighbors, and keeps every result scoped to its repository and source citation."
      />
      <div className="search-hero">
        <Search size={20} />
        <select
          value={repositoryId}
          onChange={(event) => setRepositoryId(event.target.value)}
          aria-label="Repository to search"
        >
          <option value="">All repositories</option>
          {searchableRepositories.map((repository) => (
            <option value={repository.id} key={repository.id}>
              {repository.owner}/{repository.name}
            </option>
          ))}
        </select>
        <select
          value={scope}
          onChange={(event) => {
            const nextScope = event.target.value as "all" | "github" | "notion";
            setScope(nextScope);
            if (nextScope === "notion") setRepositoryId("");
            else if (!repositoryId) setRepositoryId(searchableRepositories[0]?.id ?? "");
          }}
          aria-label="Context provider"
        >
          <option value="all">Code + Notion</option>
          <option value="github">GitHub code</option>
          <option value="notion">Notion context</option>
        </select>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void search();
          }}
          aria-label="Engineering search"
          placeholder={
            searchableRepositories.length
              ? "Search code, decisions, ADRs, and runbooks…"
              : "Search synchronized Notion context…"
          }
        />
        <button
          className="button button--primary"
          onClick={() => void search()}
          disabled={
            searching || query.trim().length < 2
          }
        >
          {searching ? "Searching…" : "Search"}
        </button>
      </div>
      {error && (
        <p className="action-notice" role="alert">
          {error}
        </p>
      )}
      <div className="search-layout">
        <main>
          <div className="search-summary">
            <span>
              {response
                ? `${response.results.length} results for “${response.query}”`
                : "Search a synchronized repository to retrieve cited source and graph-connected engineering context"}
            </span>
          </div>
          {response?.results.map((item) => {
            const repository = item.provider === "github"
              ? repositoryById.get(item.citation.repositoryId)
              : null;
            return (
              <a
                href={
                  item.provider === "notion"
                    ? item.citation.url ?? "/app/sources"
                    : "/app/graph"
                }
                key={`${item.provider}:${item.id}`}
                target={item.provider === "notion" && item.citation.url ? "_blank" : undefined}
                rel={item.provider === "notion" && item.citation.url ? "noreferrer" : undefined}
              >
                <div className="search-result-icon">
                  {item.provider === "notion" ? (
                    <FileText size={17} />
                  ) : (
                    <FileCode2 size={17} />
                  )}
                </div>
                <div>
                  <span>
                    {item.provider === "notion"
                      ? "Notion · "
                      : repository
                      ? `${repository.owner}/${repository.name} · `
                      : ""}
                    {item.provider === "github"
                      ? item.citation.filePath
                      : item.citation.title}
                    {item.provider === "github" && item.citation.lineStart
                      ? `:${item.citation.lineStart}`
                      : ""}
                  </span>
                  <h3>{item.title}</h3>
                  <p>{item.reason}</p>
                  {item.provider === "notion" && (
                    <small>
                      {item.freshness
                        ? `Synchronized ${new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(item.freshness))}`
                        : "Freshness unavailable"}
                    </small>
                  )}
                </div>
                <ArrowRight size={15} />
              </a>
            );
          })}
          {response && !response.results.length && (
            <div className="empty-state">
              <Search size={20} />
              <h2>No matching indexed context</h2>
              <p>Try a broader file, symbol, package, or system term.</p>
            </div>
          )}
        </main>
        <aside className="panel search-aside">
          <span>Search scope</span>
          <h3>
            {repositoryId
              ? repositoryById.get(repositoryId)?.name
              : "Entire workspace"}
          </h3>
          <p>
            {response
              ? response.lowConfidence
                ? "Atlas found only low-confidence matches."
                : "Results combine ranked indexed source with relevant one-hop relationships from the current engineering graph."
              : "Select a synchronized repository and search for a file, symbol, API, package, behavior, or system concept."}
          </p>
          <div>
            <ConfidenceBadge type="observed" />{" "}
            <span>Indexed source</span>
          </div>
          <div>
            <ConfidenceBadge type="inferred" />{" "}
            <span>Graph-expanded context</span>
          </div>
          <div>
            <FileText size={13} /> <span>Cited Notion documentation</span>
          </div>
          <Link
            href="/app/impact/new"
            className="button button--primary"
          >
            Analyze a related change
          </Link>
        </aside>
      </div>
    </>
  );
}
