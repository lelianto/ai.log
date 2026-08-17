export const ACTORS = ["human", "claude", "codex", "opencode", "gemini", "cursor", "aider", "cline", "system", "unknown"] as const;
export type Actor = (typeof ACTORS)[number];

export const CATEGORIES = [
  "filesystem",
  "command",
  "git",
  "dependency",
  "test",
  "network",
  "security",
  "agent",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const SOURCES = ["filesystem", "git", "process", "agent-adapter", "shell", "unknown"] as const;
export type Source = (typeof SOURCES)[number];

export const RISKS = ["none", "low", "medium", "high", "critical"] as const;
export type Risk = (typeof RISKS)[number];

export function isActor(v: unknown): v is Actor {
  return typeof v === "string" && (ACTORS as readonly string[]).includes(v);
}

export function isCategory(v: unknown): v is Category {
  return typeof v === "string" && (CATEGORIES as readonly string[]).includes(v);
}

export function isSource(v: unknown): v is Source {
  return typeof v === "string" && (SOURCES as readonly string[]).includes(v);
}

export function isRisk(v: unknown): v is Risk {
  return typeof v === "string" && (RISKS as readonly string[]).includes(v);
}

export const AGENTS = ["claude", "codex", "opencode", "gemini", "cursor", "aider", "cline"] as const;
export type Agent = (typeof AGENTS)[number];

export function isAgent(v: unknown): v is Agent {
  return typeof v === "string" && (AGENTS as readonly string[]).includes(v);
}

export function newId(prefix = "evt"): string {
  const b = crypto.getRandomValues(new Uint8Array(12));
  let s = "";
  for (const n of b) s += n.toString(36).padStart(2, "0");
  return `${prefix}_${s}`;
}

export function newSessionId(): string {
  return newId("alog");
}