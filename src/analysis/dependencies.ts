import * as fs from "fs";
import * as path from "path";
import type { Database } from "../storage/database";
import { newEvent, type AILogEvent } from "../core/events";

interface DepMap {
  [name: string]: string;
}

export type DepChangeType = "install" | "remove" | "update";

export interface DepChange {
  type: DepChangeType;
  name: string;
  from?: string;
  to?: string;
}

export interface ManifestSpec {
  file: string;
  label: string;
}

const MANIFESTS: ManifestSpec[] = [
  { file: "package.json", label: "npm" },
  { file: "pnpm-lock.yaml", label: "pnpm" },
  { file: "yarn.lock", label: "yarn" },
  { file: "package-lock.json", label: "npm-lock" },
  { file: "go.mod", label: "go" },
  { file: "go.sum", label: "go-sum" },
  { file: "Cargo.toml", label: "cargo" },
  { file: "Cargo.lock", label: "cargo-lock" },
  { file: "requirements.txt", label: "pip" },
  { file: "pyproject.toml", label: "python" },
  { file: "Pipfile", label: "pipfile" },
  { file: "composer.json", label: "composer" },
  { file: "Gemfile", label: "gem" },
];

/**
 * Watches dependency manifests. Only the manifest's dependency fields are
 * snapshotted (name + version) - values of any kind are never stored.
 * Multiple ecosystems are supported: npm/pnpm/yarn, Go, Cargo, Python,
 * PHP, Ruby. Lockfiles are parsed as best-effort; parse failures degrade
 * to an empty map (never a crash).
 */
export class DependencyTracker {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  snapshot(sessionId: string, repoDir: string): void {
    const data = this.readAllManifests(repoDir);
    this.db.insertDepSnapshot(sessionId, new Date().toISOString(), JSON.stringify(data));
  }

  onEvent(event: AILogEvent): AILogEvent[] {
    if (event.category !== "filesystem" || !event.target) return [];
    const base = event.target.split("/").pop() ?? "";
    if (!MANIFESTS.some((m) => m.file === base)) return [];
    if (event.action === "delete") return [];

    const repoDir = event.repository;
    const current = this.readAllManifests(repoDir);
    const last = this.db.getLastDepSnapshot(event.sessionId);
    if (!last) {
      this.db.insertDepSnapshot(event.sessionId, new Date().toISOString(), JSON.stringify(current));
      return [];
    }

    let previous: DepMap;
    try {
      previous = JSON.parse(last.data) as DepMap;
    } catch {
      previous = {};
    }

    const changes = diffDeps(previous, current);
    if (changes.length === 0) return [];

    this.db.insertDepSnapshot(event.sessionId, event.timestamp, JSON.stringify(current));

    const out: AILogEvent[] = [];
    for (const change of changes) {
      const action = change.type === "install" ? "install" : change.type === "remove" ? "remove" : "update";
      const metadata: Record<string, unknown> = {};
      if (change.type === "update") {
        metadata.fromVersion = change.from;
        metadata.version = change.to;
      } else if (change.type === "install" && change.to) {
        metadata.version = change.to;
      } else if (change.type === "remove" && change.from) {
        metadata.version = change.from;
      }
      out.push(
        newEvent({
          sessionId: event.sessionId,
          repository: event.repository,
          actor: event.actor,
          category: "dependency",
          action,
          source: event.source,
          target: change.name,
          confidence: event.confidence,
          observed: event.observed,
          metadata,
        })
      );
    }
    return out;
  }

  private readAllManifests(repoDir: string): DepMap {
    const out: DepMap = {};
    for (const spec of MANIFESTS) {
      const data = this.readManifest(repoDir, spec.file);
      // Prefix lockfile/manifest names with their ecosystem to avoid
      // collisions between same-named packages across ecosystems.
      const prefix = spec.label === "npm" || spec.label === "gem" || spec.label === "composer" ? "" : `${spec.label}:`;
      for (const [name, version] of Object.entries(data)) {
        out[`${prefix}${name}`] = version;
      }
    }
    return out;
  }

  private readManifest(repoDir: string, file: string): DepMap {
    try {
      const raw = fs.readFileSync(path.join(repoDir, file), "utf8");
      if (file.endsWith(".json")) return parseJsonManifest(raw, file);
      if (file.endsWith(".lock")) return parseLockfile(raw, file);
      if (file.endsWith(".toml")) return parseToml(raw);
      if (file === "go.mod") return parseGoMod(raw);
      return parseLineManifest(raw, file);
    } catch {
      return {};
    }
  }
}

export function diffDeps(previous: DepMap, current: DepMap): DepChange[] {
  const changes: DepChange[] = [];
  const all = new Set([...Object.keys(previous), ...Object.keys(current)]);

  for (const name of all) {
    const oldV = previous[name];
    const newV = current[name];
    if (oldV === undefined && newV !== undefined) {
      changes.push({ type: "install", name, to: newV });
    } else if (oldV !== undefined && newV === undefined) {
      changes.push({ type: "remove", name, from: oldV });
    } else if (oldV !== undefined && newV !== undefined && oldV !== newV) {
      changes.push({ type: "update", name, from: oldV, to: newV });
    }
  }
  return changes;
}

// ---- manifest parsers (best-effort, never throw) ----

export function parseJsonManifest(raw: string, file: string): DepMap {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: DepMap = {};
    if (file === "package.json" || file === "composer.json") {
      for (const key of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies", "require-dev", "require"]) {
        const section = parsed[key];
        if (section !== null && typeof section === "object" && !Array.isArray(section)) {
          for (const [name, version] of Object.entries(section as Record<string, unknown>)) {
            if (typeof version === "string") out[name] = version;
          }
        }
      }
    }
    return out;
  } catch {
    return {};
  }
}

function parseLockfile(raw: string, file: string): DepMap {
  if (file === "package-lock.json") {
    return parsePackageLock(raw);
  }
  if (file.endsWith(".lock")) {
    // go.sum / Cargo.lock / yarn.lock share "name <space> version" line shapes
    const out: DepMap = {};
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      const m = trimmed.match(/^([^\s]+)\s+v?([^\s]+)/);
      if (m) {
        const name = m[1];
        const version = m[2];
        if (name && version && version.length < 128) out[name] = version;
      }
    }
    return out;
  }
  return {};
}

function parsePackageLock(raw: string): DepMap {
  try {
    const parsed = JSON.parse(raw) as { packages?: Record<string, { version?: string; name?: string }> };
    const out: DepMap = {};
    if (parsed.packages && typeof parsed.packages === "object") {
      for (const [p, meta] of Object.entries(parsed.packages)) {
        if (p === "" || !meta || typeof meta !== "object") continue;
        const name = meta.name ?? p.split("node_modules/").pop() ?? p;
        if (meta.version && typeof meta.version === "string") out[name] = meta.version;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function parseToml(raw: string): DepMap {
  const out: DepMap = {};
  const lines = raw.split("\n");
  let section = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      section = trimmed.slice(1, -1).trim();
      continue;
    }
    if (trimmed.startsWith("#") || trimmed.startsWith("//") || trimmed === "") continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const rawValue = trimmed.slice(eq + 1).trim();
    if (section === "dependencies" || section === "dev-dependencies" || section.startsWith("dependencies.")) {
      let value = rawValue.replace(/["']/g, "").split(" ")[0];
      if (rawValue.startsWith("{")) {
        // inline table: { version = "1.35", features = [...] }
        const vMatch = rawValue.match(/version\s*=\s*["']([^"']+)["']/);
        value = vMatch ? vMatch[1] : "inline";
      }
      if (key && value) out[key] = value;
    } else if (section === "tool.poetry.dependencies" || section === "project") {
      if (key && key !== "name" && key !== "version" && key !== "requires-python" && value(rawValue) !== undefined) out[key] = rawValue.replace(/["']/g, "").split(" ")[0];
    }
  }
  return out;
}

function value(rawValue: string): string | undefined {
  const v = rawValue.replace(/["']/g, "").split(" ")[0];
  return v.length > 0 ? v : undefined;
}

export function parseGoMod(raw: string): DepMap {
  const out: DepMap = {};
  const lines = raw.split("\n");
  let inRequireBlock = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("require (")) {
      inRequireBlock = true;
      continue;
    }
    if (inRequireBlock && trimmed === ")") {
      inRequireBlock = false;
      continue;
    }
    if (trimmed.startsWith("//")) continue;
    if (trimmed.startsWith("require ")) {
      const m = trimmed.match(/^require\s+(\S+)\s+(v[^\s]+)/);
      if (m) out[m[1]] = m[2];
      continue;
    }
    if (inRequireBlock) {
      const m = trimmed.match(/^(\S+)\s+(v[^\s]+)/);
      if (m) out[m[1]] = m[2];
      continue;
    }
  }
  return out;
}

function parseLineManifest(raw: string, file: string): DepMap {
  const out: DepMap = {};
  if (file === "requirements.txt" || file === "Pipfile") {
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("-")) continue;
      const m = trimmed.match(/^([A-Za-z0-9_.\-]+)(?:==|>=|<=|~=|!=)(.+)$/);
      if (m) out[m[1]] = m[2].trim();
    }
    return out;
  }
  if (file === "Gemfile") {
    for (const line of raw.split("\n")) {
      const m = line.trim().match(/^gem\s+["']([^"']+)["'](?:\s*,\s*["']~?>=\s*([^"']+)["'])?/);
      if (m) out[m[1]] = m[2] ?? "latest";
    }
    return out;
  }
  return out;
}