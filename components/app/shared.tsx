import { Box, Code2, Link2 } from "lucide-react";
import { ConfidenceBadge } from "@/components/brand";
import { metrics, type ImpactItem } from "@/lib/mock-data";

export function PageHeader({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail: string; action?: React.ReactNode }) {
  return <header className="page-header"><div><span>{eyebrow}</span><h1>{title}</h1><p>{detail}</p></div>{action}</header>;
}

export function StatusDot({ state = "ready" }: { state?: "ready" | "running" | "warning" }) {
  return <span className={`status-dot status-dot--${state}`} />;
}

export function MetricCard({ metric }: { metric: (typeof metrics)[number] }) {
  return <article className={`metric-card metric-card--${metric.tone}`}><span>{metric.label}</span><strong>{metric.value}</strong><p>{metric.change}</p></article>;
}

export function ImpactCard({ item }: { item: ImpactItem }) {
  return <article className="impact-card"><div className="impact-card__icon">{item.kind === "Endpoint" ? <Link2 size={17} /> : item.kind === "Package" ? <Box size={17} /> : <Code2 size={17} />}</div><div className="impact-card__copy"><span>{item.kind}</span><h3>{item.title}</h3><p>{item.detail}</p><code>{item.evidence}</code></div><ConfidenceBadge type={item.confidence} /></article>;
}
