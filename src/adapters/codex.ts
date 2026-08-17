import type { HookPayload } from "./types";
import type { AILogEvent } from "../core/events";
import { normalizeHookPayload } from "./hook-adapter";

const CONFIDENCE = 0.97;

/**
 * Codex CLI adapter.
 * Consumes hook events (SessionStart, PreToolUse, PostToolUse, SessionEnd)
 * from .codex/hooks.json or config.toml. Payload on stdin has the same
 * shape family as Claude Code: hook_event_name, tool_name, tool_input.
 */
export function normalizeCodex(payload: HookPayload): AILogEvent | null {
  return normalizeHookPayload(payload, {
    actor: "codex",
    confidence: CONFIDENCE,
    toolVariants: {
      bash: ["Bash", "shell", "Shell"],
      read: ["Read", "View", "read"],
      write: ["Write", "write", "Edit", "edit"],
    },
    mcpPrefixes: ["mcp__", "mcp."],
    applyPatch: true,
  });
}
