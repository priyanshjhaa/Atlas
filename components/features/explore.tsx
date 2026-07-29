"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, BookOpen, Check, FileCode2, Filter, Network, Plus, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { AtlasGraph } from "@/components/atlas-graph";
import { ConfidenceBadge } from "@/components/brand";
import { PageHeader } from "@/components/app/shared";
import { searchGroups } from "@/lib/mock-data";

const graphFilters = ["All entities", "Services", "Code", "Data", "Knowledge"];

export function GraphPage({ architecture = false }: { architecture?: boolean }) {
  const [filter, setFilter] = useState("All entities");
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [confidence, setConfidence] = useState("Observed");
  const [saved, setSaved] = useState(false);
  const [updatedLabel, setUpdatedLabel] = useState("Updated 4m ago");

  function refresh() {
    setUpdatedLabel("Updated just now");
  }

  return (
    <>
      <PageHeader
        eyebrow={architecture ? "System architecture" : "Engineering knowledge graph"}
        title={architecture ? "How Northstar fits together" : "Explore every relationship"}
        detail={architecture ? "A live, source-backed view of services, data stores, queues, and system boundaries." : "Navigate repositories, code, ownership, history, and documentation as one connected system."}
        action={
          <div className="view-actions">
            <button className="button button--ghost" onClick={refresh}><RefreshCw size={14} /> {updatedLabel}</button>
            <button className="button button--primary" onClick={() => setSaved((current) => !current)}>
              {saved ? <Check size={14} /> : <Plus size={14} />} {saved ? "View saved" : "Save view"}
            </button>
          </div>
        }
      />

      <div className="graph-toolbar">
        <label className="search-input">
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Find graph entity" placeholder="Find a service, symbol, endpoint…" />
        </label>
        <div className="filter-pills" aria-label="Graph entity filters">
          {graphFilters.map((item) => <button className={filter === item ? "active" : ""} onClick={() => setFilter(item)} key={item}>{item}</button>)}
        </div>
        <button className="button button--ghost" onClick={() => setFiltersOpen((current) => !current)} aria-expanded={filtersOpen}><Filter size={14} /> Filters</button>
      </div>

      {filtersOpen && (
        <div className="inline-filter-panel">
          <span>Relationship confidence</span>
          {["Observed", "Historical", "Inferred"].map((item) => <button className={confidence === item ? "active" : ""} onClick={() => setConfidence(item)} key={item}>{item}</button>)}
        </div>
      )}

      {(query || filter !== "All entities" || saved) && (
        <p className="action-notice" aria-live="polite">
          {saved ? "This view is saved locally for the frontend prototype. " : ""}
          Showing {filter.toLowerCase()}{query ? ` matching “${query}”` : ""} with {confidence.toLowerCase()} confidence.
        </p>
      )}

      <div className="graph-layout">
        <section className="panel graph-canvas"><AtlasGraph /></section>
        <aside className="panel entity-inspector">
          <div className="entity-icon"><ShieldCheck size={20} /></div>
          <span>Service · observed</span>
          <h2>Identity Service</h2>
          <p>Owns user authentication, rotating sessions, and account recovery.</p>
          <div className="entity-meta">
            <div><span>Repository</span><b>identity-service</b></div>
            <div><span>Owner</span><b>Identity team</b></div>
            <div><span>Last indexed</span><b>{updatedLabel.replace("Updated ", "")}</b></div>
          </div>
          <h3>Key relationships</h3>
          <div className="relationship-list">
            <div><span>called by</span><b>API Gateway</b></div>
            <div><span>stores in</span><b>Session Redis</b></div>
            <div><span>exports</span><b>12 endpoints</b></div>
            <div><span>documented by</span><b>ADR-024</b></div>
          </div>
          <Link href="/app/impact/new" className="button button--primary">Analyze a change here <ArrowRight size={15} /></Link>
        </aside>
      </div>
    </>
  );
}

export function SearchPage() {
  const [query, setQuery] = useState("authentication refresh tokens");
  const [category, setCategory] = useState("All");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const groups = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return searchGroups
      .filter((group) => category === "All" || group.label === category)
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => !normalized || `${item.title} ${item.detail} ${item.meta}`.toLowerCase().includes(normalized)),
      }))
      .filter((group) => group.items.length > 0);
  }, [category, query]);

  const resultCount = groups.reduce((total, group) => total + group.items.length, 0);

  return (
    <>
      <PageHeader eyebrow="Engineering search" title="Find the system, not just the file" detail="Search across code, architecture, pull requests, and technical decisions." />
      <label className="search-hero"><Search size={20} /><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Engineering search" /><kbd>⌘ K</kbd></label>
      {filtersOpen && (
        <div className="inline-filter-panel search-filter-panel">
          {["All", ...searchGroups.map((group) => group.label)].map((item) => <button className={category === item ? "active" : ""} onClick={() => setCategory(item)} key={item}>{item}</button>)}
        </div>
      )}
      <div className="search-layout">
        <main>
          <div className="search-summary">
            <span>{resultCount} results for “{query}”</span>
            <button onClick={() => setFiltersOpen((current) => !current)} aria-expanded={filtersOpen}><Filter size={14} /> Filter</button>
          </div>
          {groups.map((group) => (
            <section className="search-group" key={group.label}>
              <h2>{group.label}<span>{group.items.length}</span></h2>
              {group.items.map((item) => (
                <Link href={item.meta.includes("Notion") ? "/app/sources" : "/app/graph"} key={item.title}>
                  <div className="search-result-icon">{group.label === "Code" ? <FileCode2 size={17} /> : group.label === "Knowledge" ? <BookOpen size={17} /> : <Network size={17} />}</div>
                  <div><span>{item.meta}</span><h3>{item.title}</h3><p>{item.detail}</p></div>
                  <ArrowRight size={15} />
                </Link>
              ))}
            </section>
          ))}
          {resultCount === 0 && <div className="empty-state"><Search size={20} /><h2>No matching context</h2><p>Try a broader system, service, or decision name.</p></div>}
        </main>
        <aside className="panel search-aside">
          <span>Atlas understood this as</span>
          <h3>{query || "Everything"}</h3>
          <p>Prioritizing services and code paths related to the current search.</p>
          <div><ConfidenceBadge type="observed" /> <span>Structural results</span></div>
          <div><ConfidenceBadge type="historical" /> <span>Historical results</span></div>
          <div><ConfidenceBadge type="inferred" /> <span>Inferred results</span></div>
          <Link href="/app/impact/new" className="button button--primary">Analyze a related change</Link>
        </aside>
      </div>
    </>
  );
}
