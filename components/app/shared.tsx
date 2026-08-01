export function PageHeader({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail: string; action?: React.ReactNode }) {
  return <header className="page-header"><div><span>{eyebrow}</span><h1>{title}</h1><p>{detail}</p></div>{action}</header>;
}

export function StatusDot({ state = "ready" }: { state?: "ready" | "running" | "warning" }) {
  return <span className={`status-dot status-dot--${state}`} />;
}

export interface Metric {
  label: string;
  value: string;
  change: string;
  tone: "orange" | "lime" | "violet" | "cyan";
}

export function MetricCard({ metric }: { metric: Metric }) {
  return <article className={`metric-card metric-card--${metric.tone}`}><span>{metric.label}</span><strong>{metric.value}</strong><p>{metric.change}</p></article>;
}
