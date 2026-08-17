import type { HookPayload } from "./types";
import type { AILogEvent, NewEventInput } from "../core/events";
import { newEvent } from "../core/events";
import { commandOf, exitCodeOf, filePathOf, isFailure, sanitizeTarget, str, urlOf } from "./common";

const CONFIDENCE = 0.97;

/**
 * Claude Code adapter.
 * Consumes hook events: SessionStart, PostToolUse, PostToolUseFailure,
 * SessionEnd (see https://code.claude.com/docs/en/hooks).
 * Hook payload arrives on stdin as JSON with tool_name + tool_input.
 */
export function normalizeClaude(payload: HookPayload): AILogEvent | null {
  const hook = str(payload.hook_event_name);
  const event: NewEventInput = {
    sessionId: str(payload.session_id) ?? "",
    repository: "",
    actor: "claude",
    category: "agent",
    action: "session-start",
    source: "agent-adapter",
    confidence: CONFIDENCE,
    observed: true,
    metadata: {},
  };

  if (!hook) return null;

  if (hook === "SessionStart" || hook === "SessionEnd") {
    event.category = "agent";
    event.action = hook === "SessionStart" ? "session-start" : "session-end";
    event.target = str(payload.cwd) ?? "";
    return newEvent(event);
  }

  if (hook === "UserPromptSubmit") {
    const text = str(payload.prompt) ?? "";
    event.category = "agent";
    event.action = "prompt";
    event.metadata = { length: text.length };
    return newEvent(event);
  }

  if (hook !== "PostToolUse" && hook !== "PostToolUseFailure") return null;

  const tool = str(payload.tool_name) ?? "";
  const meta: Record<string, unknown> = { tool };

  if (tool === "Bash" || tool === "Shell") {
    const cmd = commandOf(payload);
    event.category = "command";
    event.action = isFailure(payload) ? "fail" : "execute";
    event.target = sanitizeTarget(cmd);
    const exit = exitCodeOf(payload);
    if (exit !== undefined) meta.exitCode = exit;
    if (isFailure(payload)) meta.error = true;
    event.metadata = meta;
    return newEvent(event);
  }

  if (tool === "Read") {
    const file = filePathOf(payload);
    if (!file) return null;
    event.category = "filesystem";
    event.action = "read";
    event.target = sanitizeTarget(file);
    event.metadata = meta;
    return newEvent(event);
  }

  if (tool === "Write" || tool === "Edit" || tool === "MultiEdit" || tool === "NotebookEdit" || tool === "Patch" || tool === "WorktreeWrite") {
    const file = filePathOf(payload);
    if (!file) return null;
    event.category = "filesystem";
    event.action = "write";
    event.target = sanitizeTarget(file);
    event.metadata = meta;
    return newEvent(event);
  }

  if (tool === "WebFetch" || tool === "WebSearch") {
    event.category = "network";
    event.action = tool === "WebFetch" ? "fetch" : "search";
    event.target = sanitizeTarget(urlOf(payload) ?? str(payload.query) ?? tool);
    event.metadata = meta;
    return newEvent(event);
  }

  if (tool.startsWith("mcp__")) {
    event.category = "agent";
    event.action = "mcp-call";
    event.target = sanitizeTarget(tool);
    event.metadata = meta;
    return newEvent(event);
  }

  if (tool === "Glob" || tool === "Grep") {
    const file = filePathOf(payload) ?? commandOf(payload) ?? tool;
    event.category = "filesystem";
    event.action = "search";
    event.target = sanitizeTarget(file);
    event.metadata = meta;
    return newEvent(event);
  }

  const file = filePathOf(payload);
  if (file) {
    event.category = "filesystem";
    event.action = "access";
    event.target = sanitizeTarget(file);
    event.metadata = meta;
    return newEvent(event);
  }

  return null;
}