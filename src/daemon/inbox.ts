import * as fs from "fs";
import * as path from "path";
import { INBOX_DIR, OFFSETS_FILE } from "../core/paths";
import type { Agent } from "../core/constants";
import { isAgent } from "../core/constants";
import { redactPayload } from "../adapters/common";

export interface HookPayload {
  agent: Agent;
  at: string;
  payload: Record<string, unknown>;
}

const MAX_LINE_BYTES = 256 * 1024;

let busy = false;

/**
 * Tails the spool files written by agent hooks (.ailog/inbox/<agent>.jsonl).
 * Tracks consumed byte offsets so backlog is processed exactly once and never
 * advances past an incomplete line (a hook writing concurrently).
 */
export function tailInbox(ailogDir: string, cb: (payload: HookPayload) => void): () => void {
  const inbox = path.join(ailogDir, INBOX_DIR);
  const offsetsFile = path.join(inbox, OFFSETS_FILE);
  const offsets: Record<string, number> = loadOffsets(offsetsFile);
  let stopped = false;

  const processFiles = (): void => {
    if (busy) return;
    busy = true;
    try {
      let files: string[] = [];
      try {
        files = fs.readdirSync(inbox).filter((f) => f.endsWith(".jsonl"));
      } catch {
        return;
      }
      for (const name of files) {
        const agent = name.slice(0, -".jsonl".length);
        if (!isAgent(agent)) continue;
        const file = path.join(inbox, name);
        const offset = offsets[name] ?? 0;
        let stat;
        try {
          stat = fs.statSync(file);
        } catch {
          continue;
        }
        if (stat.size <= offset) {
          if (stat.size < offset) offsets[name] = 0;
          continue;
        }
        let fd: number | null = null;
        try {
          fd = fs.openSync(file, "r");
          const len = stat.size - offset;
          const buf = Buffer.alloc(len);
          fs.readSync(fd, buf, 0, len, offset);

          const text = buf.toString("utf8");
          const lastNewline = text.lastIndexOf("\n");
          if (lastNewline === -1) continue;

          const complete = text.slice(0, lastNewline);
          const lines = complete.split("\n");
          for (const line of lines) {
            if (!line.trim() || Buffer.byteLength(line) > MAX_LINE_BYTES) continue;
            let parsed: unknown;
            try {
              parsed = JSON.parse(line);
            } catch {
              // A single malformed line must never block the stream
              continue;
            }
            const p = parsed as Partial<HookPayload>;
            if (p === null || typeof p !== "object") continue;
            if (!isAgent(p.agent)) continue;
            if (p.payload === null || typeof p.payload !== "object" || Array.isArray(p.payload)) continue;
            // Defense in depth: redact anything the writer left unredacted.
            // Idempotent, so re-reading an already-redacted line is a no-op.
            const payload = redactPayload(p.payload as Record<string, unknown>);
            cb({ agent: p.agent, at: typeof p.at === "string" ? p.at : "", payload });
          }
          offsets[name] = offset + Buffer.byteLength(complete) + 1;
          saveOffsets(offsetsFile, offsets);
        } catch {
          // ignore and retry next tick
        } finally {
          if (fd !== null) {
            try {
              fs.closeSync(fd);
            } catch {
              // ignore
            }
          }
        }
      }
    } finally {
      busy = false;
    }
  };

  processFiles();

  const rescan = (): void => {
    if (stopped) return;
    try {
      processFiles();
    } catch {
      // ignore
    }
  };
  const timer = setInterval(rescan, 1500);
  timer.unref();

  let watcher: fs.FSWatcher | null = null;
  try {
    watcher = fs.watch(inbox, rescan);
    watcher.on("error", () => void 0);
  } catch {
    // poll fallback
  }

  return () => {
    stopped = true;
    clearInterval(timer);
    if (watcher) watcher.close();
  };
}

function loadOffsets(file: string): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isInteger(v) && v >= 0) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function saveOffsets(file: string, offsets: Record<string, number>): void {
  try {
    fs.writeFileSync(file, JSON.stringify(offsets));
  } catch {
    // ignore
  }
}