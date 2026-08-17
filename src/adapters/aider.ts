import type { HookPayload } from "./types";
import type { AILogEvent } from "../core/events";
import { normalizeHookPayload } from "./hook-adapter";

const CONFIDENCE = 0.9;

/**
 * Aider adapter.
 * Aider runs shell tools ("run", "run_ipython") and file edits through its
 * edit helper. Payloads follow the generic hook shape; tools that do not map
 * cleanly fall back to filesystem "access" or are ignored.
 */
export function normalizeAider(payload: HookPayload): AILogEvent | null {
  return normalizeHookPayload(payload, {
    actor: "aider",
    confidence: CONFIDENCE,
    toolVariants: {
      bash: ["run", "run_ipython", "shell", "Bash"],
      read: ["read", "view", "Read"],
      write: ["write", "edit", "apply_patch", "Write", "Edit"],
      search: ["grep", "Grep", "Glob"],
    },
    applyPatch: true,
  });
}