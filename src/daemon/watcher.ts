import * as path from "path";
import type { Stats } from "fs";
import chokidar from "chokidar";
import { newEvent, type AILogEvent } from "../core/events";
import { isIgnored, type AILogConfig } from "../core/config";

export type FsEventType = "create" | "write" | "delete";

export interface RawFsEvent {
  type: FsEventType;
  relPath: string;
  isDir: boolean;
}

/**
 * Watches the repository working tree. Only CREATE / WRITE / DELETE for files
 * are reported. Reads are never inferred from the filesystem (not observable).
 * Events are attributed later by the AttributionEngine.
 */
export function watchRepo(repoDir: string, config: AILogConfig, cb: (event: AILogEvent) => void): () => void {
  const handle = (type: FsEventType) => (absPath: string, stats?: Stats): void => {
    const rel = path.relative(repoDir, absPath);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return;
    if (isIgnored(rel, config)) return;
    if (stats && !stats.isFile()) return;

    const isDir = stats?.isDirectory() === true;
    const event = newEvent({
      sessionId: "",
      repository: repoDir,
      actor: "unknown",
      category: "filesystem",
      action: type,
      source: "filesystem",
      target: rel,
      metadata: { observed: false },
      confidence: 0.25,
      observed: false,
    });
    if (isDir && type === "write") return;
    cb(event);
  };

  const watcher = chokidar.watch(repoDir, {
    ignored: (p: string) => {
      if (p === repoDir) return false;
      const rel = path.relative(repoDir, p);
      if (!rel || rel.startsWith("..")) return true;
      return isIgnored(rel, config);
    },
    ignoreInitial: true,
    followSymlinks: false,
    awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 50 },
    depth: 32,
  });

  watcher.on("add", handle("create"));
  watcher.on("change", handle("write"));
  watcher.on("unlink", handle("delete"));
  watcher.on("error", (err) => console.error(`[ai.log] watcher error: ${String(err)}`));

  return () => watcher.close();
}