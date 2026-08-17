import type { HookPayload } from "./types";
import type { AILogEvent } from "../core/events";
import { normalizeHookPayload } from "./hook-adapter";

const CONFIDENCE = 0.9;

/**
 * Cline adapter.
 * Cline exposes tool events with lowercase names (read_file, write_to_file,
 * execute_command, apply_diff, web_search, ...). Best-effort mapping.
 */
export function normalizeCline(payload: HookPayload): AILogEvent | null {
  return normalizeHookPayload(payload, {
    actor: "cline",
    confidence: CONFIDENCE,
    toolVariants: {
      bash: ["execute_command", "Bash", "Shell", "shell"],
      read: ["read_file", "Read"],
      write: ["write_to_file", "apply_diff", "multi_edit", "Write", "Edit"],
      search: ["grep_search", "glob_search", "Grep", "Glob"],
      network: ["web_search", "WebSearch", "fetch"],
    },
  });
}