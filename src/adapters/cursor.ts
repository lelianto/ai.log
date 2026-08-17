import type { HookPayload } from "./types";
import type { AILogEvent } from "../core/events";
import { normalizeHookPayload } from "./hook-adapter";

const CONFIDENCE = 0.93;

/**
 * Cursor adapter.
 * Cursor exposes agent-hook style events with tool names similar to the
 * Claude Code family. Best-effort: unknown tools fall back to filesystem
 * "access" events or are ignored.
 */
export function normalizeCursor(payload: HookPayload): AILogEvent | null {
  return normalizeHookPayload(payload, {
    actor: "cursor",
    confidence: CONFIDENCE,
    toolVariants: {
      bash: ["Bash", "Shell", "shell"],
      read: ["Read", "View", "read_file", "file_read"],
      write: ["Write", "Edit", "MultiEdit", "write_file", "file_write", "apply_patch"],
      search: ["Glob", "Grep", "Search", "CodebaseSearch"],
      network: ["WebFetch", "WebSearch", "fetch"],
    },
    mcpPrefixes: ["mcp__", "mcp."],
  });
}