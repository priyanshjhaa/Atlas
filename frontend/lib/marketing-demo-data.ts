// Illustrative topology used only by the public landing page.
// Authenticated workspace screens load their data from the Atlas API.
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
