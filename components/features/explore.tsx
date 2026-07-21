"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, BookOpen, FileCode2, Filter, Network, Plus, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { AtlasGraph } from "@/components/atlas-graph";
import { ConfidenceBadge } from "@/components/brand";
import { PageHeader } from "@/components/app/shared";
import { searchGroups } from "@/lib/mock-data";

export function GraphPage({ architecture = false }: { architecture?: boolean }) {
  const [filter, setFilter] = useState("All entities");
  return (
    <>
      <PageHeader eyebrow={architecture ? "System architecture" : "Engineering knowledge graph"} title={architecture ? "How Northstar fits together" : "Explore every relationship"} detail={architecture ? "A live, source-backed view of services, data stores, queues, and system boundaries." : "Navigate repositories, code, ownership, history, and documentation as one connected system."} action={<div className="view-actions"><button className="button button--ghost"><RefreshCw size={14} /> Updated 4m ago</button><button className="button button--primary"><Plus size={14} /> Save view</button></div>} />
      <div className="graph-toolbar"><div className="search-input"><Search size={15} /><input aria-label="Find graph entity" placeholder="Find a service, symbol, endpoint…" /></div><div className="filter-pills">{["All entities", "Services", "Code", "Data", "Knowledge"].map((item) => <button className={filter === item ? "active" : ""} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div><button className="button button--ghost"><Filter size={14} /> Filters</button></div>
      <div className="graph-layout"><section className="panel graph-canvas"><AtlasGraph /></section><aside className="panel entity-inspector"><div className="entity-icon"><ShieldCheck size={20} /></div><span>Service · observed</span><h2>Identity Service</h2><p>Owns user authentication, rotating sessions, and account recovery.</p><div className="entity-meta"><div><span>Repository</span><b>identity-service</b></div><div><span>Owner</span><b>Identity team</b></div><div><span>Last indexed</span><b>4 minutes ago</b></div></div><h3>Key relationships</h3><div className="relationship-list"><div><span>called by</span><b>API Gateway</b></div><div><span>stores in</span><b>Session Redis</b></div><div><span>exports</span><b>12 endpoints</b></div><div><span>documented by</span><b>ADR-024</b></div></div><Link href="/app/impact/demo" className="button button--primary">Analyze a change here <ArrowRight size={15} /></Link></aside></div>
    </>
  );
}

export function SearchPage() {
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
