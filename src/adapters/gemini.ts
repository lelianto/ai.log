import type { HookPayload } from "./types";
import type { AILogEvent, NewEventInput } from "../core/events";
import { newEvent } from "../core/events";
import { commandOf, exitCodeOf, filePathOf, isFailure, sanitizeTarget, str } from "./common";

const CONFIDENCE = 0.93;

/**
 * Gemini CLI adapter (Google).
 * Consumes hook events from .gemini/settings.json (see
 * github.com/google-gemini/gemini-cli docs/hooks).
 * Gemini's payloads follow the same family: hook_event_name, tool_name,
 * tool_input / input. The adapter is deliberately tolerant of schema drift and
 * falls back to generic heuristics.
 */
export function normalizeGemini(payload: HookPayload): AILogEvent | null {
  const hook = str(payload.hook_event_name);
  const tool = str(payload.tool_name) ?? str(payload.tool) ?? str(payload.name) ?? "";
  const event: NewEventInput = {
    sessionId: str(payload.session_id) ?? "",
    repository: "",
    actor: "gemini",
    category: "agent",
    action: "session-start",
    source: "agent-adapter",
    confidence: CONFIDENCE,
    observed: true,
    metadata: {},
  };

  if (!hook) return generic(payload, event, tool);

  const name = String(hook).toLowerCase();

  if (name.includes("sessionstart")) {
    event.category = "agent";
    event.action = "session-start";
    event.target = str(payload.cwd) ?? "";
    return newEvent(event);
  }
  if (name.includes("sessionend")) {
    event.category = "agent";
    event.action = "session-end";
    event.target = str(payload.cwd) ?? "";
    return newEvent(event);
  }
  if (name.includes("userprompt") || name.includes("promptsubmit")) {
    const text = str(payload.prompt) ?? "";
    event.category = "agent";
    event.action = "prompt";
    event.metadata = { length: text.length };
    return newEvent(event);
  }

  const isAfter = name.includes("after") || name.includes("posttool");
  if (!isAfter) return null;

  const meta: Record<string, unknown> = { tool: tool || "unknown" };
  const failed = isFailure(payload);

  if (tool.toLowerCase().includes("code_execution") || tool.toLowerCase().includes("shell") || tool.toLowerCase().includes("terminal") || tool.toLowerCase().includes("local_shell")) {
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

  if (/edit|write|insert|replace|patch|apply/i.test(tool) || /edit|write|insert|replace/i.test(String(hook))) {
    const file = filePathOf(payload);
    if (!file) return null;
    event.category = "filesystem";
    event.action = "write";
    event.target = sanitizeTarget(file);
    event.metadata = meta;
    return newEvent(event);
  }

  if (/read|view|preview|get/i.test(tool)) {
    const file = filePathOf(payload);
    if (!file) return null;
    event.category = "filesystem";
    event.action = "read";
    event.target = sanitizeTarget(file);
    event.metadata = meta;
    return newEvent(event);
  }

  if (/web|search|fetch|http/i.test(tool)) {
    event.category = "network";
    event.action = /search/i.test(tool) ? "search" : "fetch";
    event.target = sanitizeTarget(str(payload.url) ?? str(payload.query) ?? tool);
    event.metadata = meta;
    return newEvent(event);
  }

  return generic(payload, event, tool);
}

function generic(payload: HookPayload, event: NewEventInput, tool: string): AILogEvent | null {
  const file = filePathOf(payload);
  if (file) {
    event.category = "filesystem";
    event.action = "access";
    event.target = sanitizeTarget(file);
    event.metadata = { tool: tool || "unknown" };
    return newEvent(event);
  }
  if (tool) {
    event.category = "agent";
    event.action = "tool-call";
    event.target = sanitizeTarget(tool);
    return newEvent(event);
  }
  return null;
}