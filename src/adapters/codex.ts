import type { HookPayload } from "./types";
import type { AILogEvent, NewEventInput } from "../core/events";
import { newEvent } from "../core/events";
import { commandOf, exitCodeOf, filePathOf, isFailure, sanitizeTarget, str } from "./common";

const CONFIDENCE = 0.97;

/**
 * Codex CLI adapter.
 * Consumes hook events (SessionStart, PreToolUse, PostToolUse, SessionEnd)
 * from .codex/hooks.json or config.toml. Payload on stdin has the same
 * shape family as Claude Code: hook_event_name, tool_name, tool_input.
 */
export function normalizeCodex(payload: HookPayload): AILogEvent | null {
  const hook = str(payload.hook_event_name);
  const event: NewEventInput = {
    sessionId: str(payload.session_id) ?? "",
    repository: "",
    actor: "codex",
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
  const failed = isFailure(payload);

  if (tool === "Bash" || tool === "shell" || tool === "Shell") {
    const cmd = commandOf(payload);
    event.category = "command";
    event.action = failed ? "fail" : "execute";
    event.target = sanitizeTarget(cmd);
    const exit = exitCodeOf(payload);
    if (exit !== undefined) meta.exitCode = exit;
    if (failed) meta.error = true;
    event.metadata = meta;
    return newEvent(event);
  }

  if (tool === "Read" || tool === "View" || tool === "read") {
    const file = filePathOf(payload);
    if (!file) return null;
    event.category = "filesystem";
    event.action = "read";
    event.target = sanitizeTarget(file);
    event.metadata = meta;
    return newEvent(event);
  }

  if (tool === "Write" || tool === "write" || tool === "Edit" || tool === "edit") {
    const file = filePathOf(payload);
    if (!file) return null;
    event.category = "filesystem";
    event.action = "write";
    event.target = sanitizeTarget(file);
    event.metadata = meta;
    return newEvent(event);
  }

  if (tool === "apply_patch") {
    event.category = "filesystem";
    event.action = "apply-patch";
    event.target = sanitizeTarget(str(payload.file_path) ?? str(payload.path) ?? "patch");
    event.metadata = meta;
    return newEvent(event);
  }

  if (tool.startsWith("mcp__") || tool.startsWith("mcp.")) {
    event.category = "agent";
    event.action = "mcp-call";
    event.target = sanitizeTarget(tool);
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