export type Confidence = "observed" | "historical" | "inferred";

export type Metric = {
  label: string;
  value: string;
  change: string;
  tone: "orange" | "cyan" | "lime" | "violet";
};

export type ImpactItem = {
  title: string;
  detail: string;
  kind: string;
  confidence: Confidence;
  evidence: string;
};

export const workspace = {
  name: "Northstar Labs",
  initials: "NL",
  indexedAt: "4 min ago",
  coverage: 96,
};

export const metrics: Metric[] = [
  { label: "Repositories", value: "12", change: "+2 this month", tone: "orange" },
  { label: "Services", value: "28", change: "94% mapped", tone: "cyan" },
  { label: "API endpoints", value: "184", change: "11 external", tone: "lime" },
  { label: "Knowledge links", value: "3.8k", change: "+241 this week", tone: "violet" },
];

export const repositories = [
  { name: "storefront-web", language: "TypeScript", status: "Ready", files: "1,284", updated: "2m" },
  { name: "api-gateway", language: "TypeScript", status: "Ready", files: "642", updated: "4m" },
  { name: "identity-service", language: "TypeScript", status: "Ready", files: "438", updated: "4m" },
  { name: "billing-service", language: "TypeScript", status: "Syncing", files: "719", updated: "now" },
  { name: "shared-contracts", language: "TypeScript", status: "Ready", files: "206", updated: "9m" },
];

export const pullRequests = [
  { id: "#482", title: "Replace session tokens with rotating refresh tokens", repo: "identity-service", author: "Maya", risk: "High" },
  { id: "#917", title: "Add invoice preview endpoint", repo: "billing-service", author: "Jon", risk: "Medium" },
  { id: "#311", title: "Move auth state into edge middleware", repo: "storefront-web", author: "Leah", risk: "Medium" },
];

export const activity = [
  { time: "10:42", title: "billing-service sync started", detail: "Commit 8f21c9a · webhook", state: "running" },
  { time: "10:38", title: "Architecture graph updated", detail: "18 entities · 31 relationships", state: "done" },
  { time: "10:31", title: "Notion context refreshed", detail: "Identity & Access database · 14 pages", state: "done" },
  { time: "09:56", title: "Impact analysis completed", detail: "PR #482 · 7 affected components", state: "done" },
];

export const directImpacts: ImpactItem[] = [
  {
    title: "SessionController.refresh()",
    detail: "The response contract removes sessionToken and introduces refreshTokenId.",
    kind: "Symbol",
    confidence: "observed",
    evidence: "identity-service/src/session/session.controller.ts:84",
  },
  {
    title: "@northstar/auth-contracts",
    detail: "Two exported response types are consumed by three repositories.",
    kind: "Package",
    confidence: "observed",
    evidence: "shared-contracts/src/auth/session.ts:12",
  },
  {
    title: "POST /v2/auth/refresh",
    detail: "Gateway validation and response serialization both depend on the old shape.",
    kind: "Endpoint",
    confidence: "observed",
    evidence: "api-gateway/src/routes/auth.ts:117",
  },
];

export const downstreamImpacts: ImpactItem[] = [
  {
    title: "storefront-web / edge middleware",
    detail: "Reads sessionToken from the refresh response before updating the encrypted cookie.",
    kind: "Service",
    confidence: "observed",
    evidence: "storefront-web/src/middleware/auth-session.ts:42",
  },
  {
    title: "checkout-worker",
    detail: "Historically changed alongside refresh-token TTL updates in four pull requests.",
    kind: "Worker",
    confidence: "historical",
    evidence: "PRs #204, #287, #401, #433",
  },
  {
    title: "Mobile authentication clients",
    detail: "The migration ADR mentions mobile consumers, but their repository is not connected.",
    kind: "External",
    confidence: "inferred",
    evidence: "Notion · ADR-024 Token rotation",
  },
];

export const evidence = [
  { source: "Code", title: "SessionController.refresh", detail: "identity-service · lines 84–112", tone: "orange" },
  { source: "GitHub", title: "PR #401 · Rotate compromised sessions", detail: "Merged 3 months ago · 8 files", tone: "violet" },
  { source: "Notion", title: "ADR-024 · Token rotation", detail: "Updated by Maya Chen · 6 weeks ago", tone: "cyan" },
];

export const searchGroups = [
  {
    label: "Services",
    items: [
      { title: "Identity Service", meta: "service · identity-service", detail: "Authentication, session rotation, and account recovery." },
      { title: "API Gateway", meta: "service · api-gateway", detail: "Public routing, response validation, and rate limiting." },
    ],
  },
  {
    label: "Code",
    items: [
      { title: "SessionController.refresh", meta: "symbol · TypeScript", detail: "Creates and rotates authenticated user sessions." },
      { title: "RefreshSessionResponse", meta: "interface · shared-contracts", detail: "Shared response contract used by three repositories." },
    ],
  },
  {
    label: "Knowledge",
    items: [
      { title: "ADR-024 · Token rotation", meta: "Notion · architecture decision", detail: "Why rotating refresh tokens replaced persistent sessions." },
      { title: "PR #401 · Rotate compromised sessions", meta: "GitHub · pull request", detail: "Previous rollout, monitoring, and rollback notes." },
    ],
  },
];

export const graphNodes = [
  { id: "web", position: { x: 20, y: 130 }, data: { label: "Storefront" }, type: "input", className: "graph-node graph-node--web" },
  { id: "gateway", position: { x: 240, y: 130 }, data: { label: "API Gateway" }, className: "graph-node graph-node--gateway" },
  { id: "identity", position: { x: 470, y: 28 }, data: { label: "Identity Service" }, className: "graph-node graph-node--identity" },
  { id: "billing", position: { x: 470, y: 220 }, data: { label: "Billing Service" }, className: "graph-node graph-node--billing" },
  { id: "redis", position: { x: 710, y: 20 }, data: { label: "Session Redis" }, type: "output", className: "graph-node graph-node--data" },
  { id: "postgres", position: { x: 710, y: 220 }, data: { label: "Billing DB" }, type: "output", className: "graph-node graph-node--data" },
  { id: "queue", position: { x: 710, y: 332 }, data: { label: "Invoice Queue" }, type: "output", className: "graph-node graph-node--queue" },
];

export const graphEdges = [
  { id: "web-gateway", source: "web", target: "gateway", animated: true, label: "calls" },
  { id: "gateway-identity", source: "gateway", target: "identity", animated: true, label: "routes" },
  { id: "gateway-billing", source: "gateway", target: "billing", label: "routes" },
  { id: "identity-redis", source: "identity", target: "redis", animated: true, label: "stores" },
  { id: "billing-postgres", source: "billing", target: "postgres", label: "writes" },
  { id: "billing-queue", source: "billing", target: "queue", label: "publishes", style: { strokeDasharray: "5 5" } },
];
