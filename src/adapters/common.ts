import type { HookPayload } from "./types";
import { MAX_TARGET_LENGTH, sanitizeString } from "../core/events";

export function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function firstString(obj: Record<string, unknown> | undefined, ...keys: string[]): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  for (const k of keys) {
    const v = (obj as Record<string, unknown>)[k];
    if (typeof v === "string" && v.trim().length > 0) return v;
  }
  return undefined;
}

export function has(obj: Record<string, unknown> | undefined, ...keys: string[]): boolean {
  if (!obj || typeof obj !== "object") return false;
  return keys.some((k) => Object.prototype.hasOwnProperty.call(obj, k));
}

export function filePathOf(payload: HookPayload | undefined): string | undefined {
  if (!payload) return undefined;
  const toolInput = (payload.tool_input ?? payload.input ?? payload.arguments ?? {}) as Record<string, unknown> | undefined;
  const fromToolInput = firstString(toolInput, "file_path", "filePath", "path", "filename", "file");
  if (fromToolInput) return fromToolInput;
  return firstString(payload, "file_path", "filePath", "path", "filename");
}

export function commandOf(payload: HookPayload | undefined): string | undefined {
  if (!payload) return undefined;
  const toolInput = (payload.tool_input ?? payload.input ?? payload.arguments ?? {}) as Record<string, unknown> | undefined;
  const direct = firstString(toolInput, "command", "cmd", "shell_command");
  if (direct) return direct;
  const list = Array.isArray(toolInput?.commands) ? (toolInput.commands as unknown[]) : undefined;
  if (list) {
    const parts = list
      .map((c) => (typeof c === "string" ? c.trim() : typeof c === "object" && c !== null && typeof (c as Record<string, unknown>).command === "string" ? ((c as Record<string, unknown>).command as string).trim() : ""))
      .filter((s) => s.length > 0);
    if (parts.length > 0) return parts.join("\n");
  }
  if (typeof toolInput?.code === "string" && toolInput.code.length < 2048) return toolInput.code;
  return undefined;
}

export function sanitizeTarget(v: string | undefined, fallback = "unknown"): string {
  const s = sanitizeString(v ?? "", MAX_TARGET_LENGTH);
  return s.length > 0 ? s : fallback;
}

export function urlOf(payload: HookPayload | undefined): string | undefined {
  if (!payload) return undefined;
  const toolInput = (payload.tool_input ?? payload.input ?? payload.arguments ?? {}) as Record<string, unknown> | undefined;
  return firstString(toolInput, "url", "uri") ?? firstString(payload, "url", "uri");
}

export function isFailure(payload: HookPayload): boolean {
  const response = (payload.tool_response ?? payload.result ?? payload.output ?? {}) as Record<string, unknown> | undefined;
  if (response && (has(response, "error", "failed", "failure", "is_error") || has(payload, "error"))) {
    const error = response.error ?? payload.error;
    if (error !== undefined && error !== null && error !== false && error !== "" && error !== "0") return true;
  }
  if (typeof response?.success === "boolean" && !response.success) return true;
  if (payload.is_error !== undefined && payload.is_error !== null && payload.is_error !== false) return true;
  const exit = num(payload.exit_code ?? payload.exitCode ?? response?.exit_code ?? response?.exit ?? response?.exitCode);
  if (exit !== undefined && exit !== 0) return true;
  return false;
}

export function exitCodeOf(payload: HookPayload): number | undefined {
  const response = (payload.tool_response ?? payload.result ?? payload.output ?? {}) as Record<string, unknown> | undefined;
  const exit = num(payload.exit_code ?? payload.exitCode ?? response?.exit_code ?? response?.exit ?? response?.exitCode);
  return exit !== undefined ? Math.trunc(exit) : undefined;
}

export function environCwd(payload: HookPayload, fallback: string): string {
  return str(payload.cwd ?? payload.workingDirectory ?? payload.working_dir) ?? fallback;
}