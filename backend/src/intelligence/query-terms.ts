const stopWords = new Set([
  "about",
  "after",
  "based",
  "before",
  "change",
  "could",
  "from",
  "into",
  "local",
  "replace",
  "should",
  "that",
  "their",
  "this",
  "update",
  "with",
]);

const conceptAliases: Record<string, string[]> = {
  authentication: ["auth", "session", "identity"],
  authenticate: ["auth", "session"],
  betterauth: ["better-auth", "betterAuth", "auth", "session"],
  jwt: ["token", "bearer", "session", "jose"],
  oauth: ["github", "provider", "callback", "session"],
  authorization: ["guard", "role", "permission", "access"],
  database: ["db", "repository", "schema"],
  synchronize: ["sync", "index", "repository"],
};

export function expandedQueryTerms(query: string, limit = 24): string[] {
  const original = query
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9_./-]+/g, " ")
    .split(/\s+/)
    .filter((term) => term.length >= 3 && !stopWords.has(term));
  const expanded = original.flatMap((term) => [
    term,
    ...(conceptAliases[term.replace(/[-_]/g, "")] ?? []),
  ]);
  return [...new Set(expanded.map((term) => term.toLowerCase()))].slice(
    0,
    limit,
  );
}
