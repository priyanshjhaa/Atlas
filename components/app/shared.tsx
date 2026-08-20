export function PageHeader({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail: string; action?: React.ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <span><i />{eyebrow}</span>
        <h1>{title}</h1>
        <p>{detail}</p>
      </div>
      {action}
      <div className="page-header__trace" aria-hidden="true">
        <i /><span /><span /><span />
        <small>context, connected</small>
      </div>
    </header>
  );
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
  return <article className={`system-readout system-readout--${metric.tone}`}><i aria-hidden="true" /><div><span>{metric.label}</span><p>{metric.change}</p></div><strong>{metric.value}</strong></article>;
}
