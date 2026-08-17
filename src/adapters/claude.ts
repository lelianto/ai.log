import type { HookPayload } from "./types";
import type { AILogEvent } from "../core/events";
import { normalizeHookPayload } from "./hook-adapter";

const CONFIDENCE = 0.97;

/**
 * Claude Code adapter.
 * Consumes hook events: SessionStart, PostToolUse, PostToolUseFailure,
 * SessionEnd (see https://code.claude.com/docs/en/hooks).
 * Hook payload arrives on stdin as JSON with tool_name + tool_input.
 */
export function normalizeClaude(payload: HookPayload): AILogEvent | null {
  return normalizeHookPayload(payload, {
    actor: "claude",
    confidence: CONFIDENCE,
    toolVariants: {
      bash: ["Bash", "Shell"],
      read: ["Read"],
      write: ["Write", "Edit", "MultiEdit", "NotebookEdit", "Patch", "WorktreeWrite"],
      search: ["Glob", "Grep"],
      network: ["WebFetch", "WebSearch"],
    },
    mcpPrefixes: ["mcp__"],
  });
}
