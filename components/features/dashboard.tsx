import Link from "next/link";
import { ArrowRight, GitPullRequest, Sparkles, Zap } from "lucide-react";
import { AtlasGraph } from "@/components/atlas-graph";
import { activity, metrics, pullRequests } from "@/lib/mock-data";
import { MetricCard, PageHeader, StatusDot } from "@/components/app/shared";

export function DashboardPage({ userName }: { userName: string }) {
  const firstName = userName.trim().split(/\s+/)[0] || userName;
  return (
    <>
      <PageHeader eyebrow="Workspace overview" title={`Good morning, ${firstName}.`} detail="Northstar Labs is mapped and ready. Here’s what changed since your last visit." action={<Link className="button button--primary" href="/app/impact/new"><Zap size={16} /> Analyze a change</Link>} />
      <div className="metrics-grid">{metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}</div>
      <div className="dashboard-grid">
        <section className="panel panel--graph"><div className="panel-heading"><div><span>Live system map</span><h2>Connected architecture</h2></div><Link href="/app/graph">Open graph <ArrowRight size={14} /></Link></div><AtlasGraph compact /></section>
        <section className="panel"><div className="panel-heading"><div><span>Suggested investigations</span><h2>Ask Atlas</h2></div><Sparkles size={18} /></div><div className="question-list">{["What breaks if we change the refresh-token response?", "How does checkout reach the invoice queue?", "Why was Redis introduced for sessions?"].map((question, index) => <Link href={index === 0 ? "/app/impact/new" : "/app/search"} key={question}><span>0{index + 1}</span><p>{question}</p><ArrowRight size={15} /></Link>)}</div></section>
        <section className="panel"><div className="panel-heading"><div><span>Change radar</span><h2>Pull requests to watch</h2></div><GitPullRequest size={18} /></div><div className="pr-list">{pullRequests.map((pr) => <article key={pr.id}><span className={`risk risk--${pr.risk.toLowerCase()}`}>{pr.risk}</span><div><b>{pr.id} {pr.title}</b><p>{pr.repo} · {pr.author}</p></div></article>)}</div></section>
        <section className="panel"><div className="panel-heading"><div><span>Repository intelligence</span><h2>Index activity</h2></div><Link href="/app/activity">View all</Link></div><div className="timeline timeline--compact">{activity.slice(0, 3).map((item) => <div key={item.title}><StatusDot state={item.state === "running" ? "running" : "ready"} /><span>{item.time}</span><p><b>{item.title}</b><small>{item.detail}</small></p></div>)}</div></section>
      </div>
    </>
  );
}
