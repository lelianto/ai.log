import type { HookPayload } from "./types";
import type { AILogEvent, NewEventInput } from "../core/events";
import { newEvent } from "../core/events";
import { filePathOf, sanitizeTarget, str } from "./common";

const CONFIDENCE = 0.9;

/**
 * OpenCode adapter.
 * OpenCode does not use stdin-command hooks; an ai.log plugin forwards bus
 * events (session.created, tool.execute.after, file.edited) by writing the
 * same JSONL payload shape to the inbox. This adapter normalizes those.
 */
export function normalizeOpenCode(payload: HookPayload): AILogEvent | null {
  const event: NewEventInput = {
    sessionId: str(payload.session_id) ?? str(payload.sessionID) ?? "",
    repository: "",
    actor: "opencode",
    category: "agent",
    action: "session-start",
    source: "agent-adapter",
    confidence: CONFIDENCE,
    observed: true,
    metadata: {},
  };

  const eventType = str(payload.event_type) ?? str(payload.type) ?? "";

  if (eventType.includes("session.created")) {
    event.category = "agent";
    event.action = "session-start";
    event.target = str(payload.cwd) ?? "";
    return newEvent(event);
  }
  if (eventType.includes("session.deleted") || eventType.includes("server.instance.disposed")) {
    event.category = "agent";
    event.action = "session-end";
    event.target = str(payload.cwd) ?? "";
    return newEvent(event);
  }

  if (eventType.includes("tool.execute")) {
    const isAfter = eventType.includes("after");
    const tool = str(payload.tool) ?? str(payload.tool_name) ?? "unknown";
    const meta: Record<string, unknown> = { tool };
    const failed = payload.error !== undefined && payload.error !== null && payload.error !== false;
    if (isAfter && failed) meta.error = true;

    if (tool === "bash" || tool === "shell" || tool === "command") {
      const args = (payload.args ?? {}) as Record<string, unknown>;
      const cmd = str(payload.command) ?? str(args.command);
      if (!isAfter) return null;
      event.category = "command";
      event.action = failed ? "fail" : "execute";
      event.target = sanitizeTarget(cmd);
      event.metadata = meta;
      return newEvent(event);
    }

    const args = (payload.args ?? {}) as Record<string, unknown>;
    const file = filePathOf(payload) ?? str(args.filePath) ?? str(payload.file);
    if (isAfter && file) {
      if (tool === "edit" || tool === "write" || tool === "create" || tool === "patch") {
        event.category = "filesystem";
        event.action = "write";
        event.target = sanitizeTarget(file);
        event.metadata = meta;
        return newEvent(event);
      }
      if (tool === "read" || tool === "view") {
        event.category = "filesystem";
        event.action = "read";
        event.target = sanitizeTarget(file);
        event.metadata = meta;
        return newEvent(event);
      }
    }
    if (isAfter) {
      event.category = "agent";
      event.action = "tool-call";
      event.target = sanitizeTarget(tool);
      event.metadata = meta;
      return newEvent(event);
    }
    return null;
  }

  if (eventType.includes("file.edited") || eventType.includes("session.diff")) {
    event.category = "filesystem";
    event.action = "write";
    event.target = sanitizeTarget(str(payload.file) ?? str(payload.path) ?? str(payload.filePath) ?? "unknown");
    event.metadata = {};
    return newEvent(event);
  }

  if (eventType.includes("session.error")) {
    event.category = "agent";
    event.action = "error";
    event.target = str(payload.error) ?? "error";
    event.metadata = { tool: "session" };
    return newEvent(event);
  }

  return null;
}