import type { HookPayload } from "./types";
import type { AILogEvent, NewEventInput } from "../core/events";
import { newEvent } from "../core/events";
import type { Agent } from "../core/constants";
import { commandOf, exitCodeOf, filePathOf, isFailure, sanitizeTarget, str, urlOf } from "./common";

export interface ToolVariants {
  bash?: string[];
  read?: string[];
  write?: string[];
  search?: string[];
  network?: string[];
}

export interface HookAdapterOptions {
  actor: Agent;
  confidence: number;
  toolVariants?: ToolVariants;
  mcpPrefixes?: string[];
  applyPatch?: boolean;
}

const DEFAULT_TOOL_VARIANTS: Required<ToolVariants> = {
  bash: [],
  read: [],
  write: [],
  search: [],
  network: [],
};

function toolVariantsOf(opts: HookAdapterOptions): Required<ToolVariants> {
  return {
    bash: opts.toolVariants?.bash ?? DEFAULT_TOOL_VARIANTS.bash,
    read: opts.toolVariants?.read ?? DEFAULT_TOOL_VARIANTS.read,
    write: opts.toolVariants?.write ?? DEFAULT_TOOL_VARIANTS.write,
    search: opts.toolVariants?.search ?? DEFAULT_TOOL_VARIANTS.search,
    network: opts.toolVariants?.network ?? DEFAULT_TOOL_VARIANTS.network,
  };
}

/**
 * Shared normalizer for stdin-hook agents whose payloads share the
 * Claude-Code-style shape (hook_event_name / tool_name / tool_input):
 * Claude Code and Codex CLI. Agent-specific tool naming and mcp prefix
 * conventions are supplied through {@link HookAdapterOptions}; the
 * session/prompt/tool-classification/fallback logic is common.
 */
export function normalizeHookPayload(payload: HookPayload, opts: HookAdapterOptions): AILogEvent | null {
  const hook = str(payload.hook_event_name);
  const event: NewEventInput = {
    sessionId: str(payload.session_id) ?? "",
    repository: "",
    actor: opts.actor,
    category: "agent",
    action: "session-start",
    source: "agent-adapter",
    confidence: opts.confidence,
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

  const variants = toolVariantsOf(opts);
  const tool = str(payload.tool_name) ?? "";
  const meta: Record<string, unknown> = { tool };
  const failed = isFailure(payload);

  if (variants.bash.includes(tool)) {
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

  if (variants.read.includes(tool)) {
    const file = filePathOf(payload);
    if (!file) return null;
    event.category = "filesystem";
    event.action = "read";
    event.target = sanitizeTarget(file);
    event.metadata = meta;
    return newEvent(event);
  }

  if (variants.write.includes(tool)) {
    const file = filePathOf(payload);
    if (!file) return null;
    event.category = "filesystem";
    event.action = "write";
    event.target = sanitizeTarget(file);
    event.metadata = meta;
    return newEvent(event);
  }

  if (opts.applyPatch && tool === "apply_patch") {
    event.category = "filesystem";
    event.action = "apply-patch";
    event.target = sanitizeTarget(str(payload.file_path) ?? str(payload.path) ?? "patch");
    event.metadata = meta;
    return newEvent(event);
  }

  if (variants.network.includes(tool)) {
    event.category = "network";
    event.action = tool.includes("Search") ? "search" : "fetch";
    event.target = sanitizeTarget(urlOf(payload) ?? str(payload.query) ?? tool);
    event.metadata = meta;
    return newEvent(event);
  }

  if (variants.search.includes(tool)) {
    const file = filePathOf(payload) ?? commandOf(payload) ?? tool;
    event.category = "filesystem";
    event.action = "search";
    event.target = sanitizeTarget(file);
    event.metadata = meta;
    return newEvent(event);
  }

  const mcpPrefixes = opts.mcpPrefixes ?? [];
  if (mcpPrefixes.some((p) => tool.startsWith(p))) {
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
