"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  FileCode2,
  Filter,
  Network,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { AtlasGraph } from "@/components/atlas-graph";
import { ConfidenceBadge } from "@/components/brand";
import { PageHeader } from "@/components/app/shared";
import type {
  AtlasArchitectureSnapshot,
  AtlasGraph as AtlasGraphData,
  AtlasIntelligenceSearchResponse,
  AtlasRepository,
  AtlasWorkspace,
} from "@/lib/api-types";

function readable(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function GraphPage({
  workspace,
  repositories,
  graph,
  architectureSnapshot = null,
  architecture = false,
}: {
  workspace: AtlasWorkspace;
  repositories: AtlasRepository[];
  graph: AtlasGraphData | null;
  architectureSnapshot?: AtlasArchitectureSnapshot | null;
  architecture?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [entityType, setEntityType] = useState("all");
  const [classification, setClassification] = useState<
    "all" | "observed" | "historical" | "inferred"
  >("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [isRefreshing, startRefresh] = useTransition();

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
          `${node.name} ${node.path ?? ""} ${node.repositoryOwner}/${node.repositoryName}`
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
  }, [classification, entityType, graph, query]);
  const selectedNode =
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
  const lastGenerated = architectureSnapshot?.generatedAt
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(architectureSnapshot.generatedAt))
    : null;

  return (
    <>
      <PageHeader
        eyebrow={
          architecture
            ? "System architecture"
            : "Engineering knowledge graph"
        }
        title={
          architecture
            ? `How ${workspace.name} fits together`
            : `Explore ${workspace.name}`
        }
        detail={
          architectureSnapshot?.summary ??
          (graph
            ? `${graph.nodes.length} current and historical repository, package, file, and symbol entities connected by ${graph.edges.length} observed, historical, or inferred relationships at a specific source revision.`
            : "Synchronize a GitHub repository to resolve packages, files, symbols, imports, API relationships, and cross-repository paths into a source-backed graph.")
        }
        action={
          <button
            className="button button--ghost"
            onClick={() => startRefresh(() => router.refresh())}
            disabled={isRefreshing}
          >
            <RefreshCw className={isRefreshing ? "spin" : ""} size={14} />
            {isRefreshing
              ? "Refreshing…"
              : lastGenerated
                ? `Generated ${lastGenerated}`
                : "Refresh"}
          </button>
        }
      />

      <div className="graph-toolbar">
        <label className="search-input">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Find graph entity"
            placeholder="Find an indexed repository, package, file, or symbol…"
          />
        </label>
        <div className="filter-pills" aria-label="Graph entity filters">
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
        <button
          className="button button--ghost"
          onClick={() => setFiltersOpen((current) => !current)}
          aria-expanded={filtersOpen}
        >
          <Filter size={14} /> Relationships
        </button>
      </div>

      {filtersOpen && (
        <div className="inline-filter-panel">
          <span>Relationship classification</span>
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
      )}

      <div className="graph-layout">
        <section className="panel graph-canvas">
          <AtlasGraph
            graph={visibleGraph}
            repositories={repositories.filter(
              (repository) => repository.isActive,
            )}
          />
        </section>
        <aside className="panel entity-inspector">
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
                  `${selectedNode.repositoryOwner}/${selectedNode.repositoryName}`}
              </p>
              <div className="entity-meta">
                <div>
                  <span>Repository</span>
                  <b>
                    {selectedNode.repositoryOwner}/
                    {selectedNode.repositoryName}
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
              </div>
              <h3>Connected relationships</h3>
              <div className="relationship-list">
                {selectedRelationships.slice(0, 6).map((edge) => (
                  <div key={edge.id}>
                    <span>{readable(edge.kind)}</span>
                    <b>{readable(edge.classification)}</b>
                  </div>
                ))}
                {!selectedRelationships.length && (
                  <p>No relationships match the current filters.</p>
                )}
              </div>
              <Link
                href="/app/impact/new"
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
        </aside>
      </div>
    </>
  );
}

export function SearchPage({
  workspace,
  repositories,
}: {
  workspace: AtlasWorkspace;
  repositories: AtlasRepository[];
}) {
  const searchableRepositories = repositories.filter(
    (repository) => repository.isActive && repository.lastSyncedAt,
  );
  const [repositoryId, setRepositoryId] = useState(
    searchableRepositories[0]?.id ?? "",
  );
  const [query, setQuery] = useState("");
  const [response, setResponse] =
    useState<AtlasIntelligenceSearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const repositoryById = new Map(
    repositories.map((repository) => [repository.id, repository]),
  );

  async function search() {
    if (!repositoryId || query.trim().length < 2) return;
    setSearching(true);
    setError("");
    const result = await fetch("/api/intelligence/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: workspace.id,
        repositoryId,
        query: query.trim(),
      }),
    });
    const body = (await result.json()) as
      | AtlasIntelligenceSearchResponse
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
          {searchableRepositories.map((repository) => (
            <option value={repository.id} key={repository.id}>
              {repository.owner}/{repository.name}
            </option>
          ))}
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
              ? "Search indexed source…"
              : "Synchronize a repository to search"
          }
          disabled={!searchableRepositories.length}
        />
        <button
          className="button button--primary"
          onClick={() => void search()}
          disabled={
            searching || !repositoryId || query.trim().length < 2
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
            const repository = repositoryById.get(
              item.citation.repositoryId,
            );
            return (
              <Link href="/app/graph" key={item.id}>
                <div className="search-result-icon">
                  <FileCode2 size={17} />
                </div>
                <div>
                  <span>
                    {repository
                      ? `${repository.owner}/${repository.name} · `
                      : ""}
                    {item.citation.filePath}
                    {item.citation.lineStart
                      ? `:${item.citation.lineStart}`
                      : ""}
                  </span>
                  <h3>{item.citation.symbol ?? item.citation.filePath}</h3>
                  <p>{item.reason}</p>
                </div>
                <ArrowRight size={15} />
              </Link>
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
              : "No synchronized repository"}
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
