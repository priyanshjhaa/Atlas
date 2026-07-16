import Link from "next/link";

export function AtlasMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="brand" aria-label="Atlas home">
      <span className="brand-mark" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {!compact && <span>atlas</span>}
    </Link>
  );
}

export function ConfidenceBadge({ type }: { type: "observed" | "historical" | "inferred" }) {
  return <span className={`confidence confidence--${type}`}>{type}</span>;
}
