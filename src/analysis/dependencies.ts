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

const MANIFESTS = ["package.json"];

/**
 * Watches dependency manifests. Only the manifest's dependency fields are
 * snapshotted (name + version) - values of any kind are never stored.
 */
export class DependencyTracker {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  snapshot(sessionId: string, repoDir: string): void {
    const data = this.readManifest(repoDir);
    this.db.insertDepSnapshot(sessionId, new Date().toISOString(), JSON.stringify(data));
  }

  onEvent(event: AILogEvent): AILogEvent[] {
    if (event.category !== "filesystem" || !event.target) return [];
    if (!MANIFESTS.includes(event.target.split("/").pop() ?? "")) return [];
    if (event.action === "delete") return [];

    const repoDir = event.repository;
    const current = this.readManifest(repoDir);
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
      if (change.from) metadata.previousVersion = change.from;
      if (change.to) metadata.version = change.to;
      if (change.type === "update") metadata.fromVersion = change.from;
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

  private readManifest(repoDir: string): DepMap {
    try {
      const raw = fs.readFileSync(path.join(repoDir, "package.json"), "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const out: DepMap = {};
      for (const key of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
        const section = parsed[key];
        if (section !== null && typeof section === "object" && !Array.isArray(section)) {
          for (const [name, version] of Object.entries(section as Record<string, unknown>)) {
            if (typeof version === "string") out[name] = version;
          }
        }
      }
      return out;
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