import type { HookPayload } from "./types";
import { MAX_TARGET_LENGTH, sanitizeString } from "../core/events";
import { isSensitiveKeyMatch, redactCommand, redactString } from "../security/redact";

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

function toolInputOf(payload: HookPayload | undefined): Record<string, unknown> | undefined {
  if (!payload) return undefined;
  const v = payload.tool_input ?? payload.input ?? payload.arguments;
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function responseOf(payload: HookPayload): Record<string, unknown> | undefined {
  const v = payload.tool_response ?? payload.result ?? payload.output;
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

export function filePathOf(payload: HookPayload | undefined): string | undefined {
  if (!payload) return undefined;
  const fromToolInput = firstString(toolInputOf(payload), "file_path", "filePath", "path", "filename", "file");
  if (fromToolInput) return fromToolInput;
  return firstString(payload, "file_path", "filePath", "path", "filename");
}

function commandFromItem(c: unknown): string {
  if (typeof c === "string") return c.trim();
  if (c !== null && typeof c === "object") {
    const command = (c as Record<string, unknown>).command;
    if (typeof command === "string") return command.trim();
  }
  return "";
}

export function commandOf(payload: HookPayload | undefined): string | undefined {
  if (!payload) return undefined;
  const toolInput = toolInputOf(payload);
  const direct = firstString(toolInput, "command", "cmd", "shell_command");
  if (direct) return redactCommand(direct);
  const list = Array.isArray(toolInput?.commands) ? (toolInput.commands as unknown[]) : undefined;
  if (list) {
    const parts = list.map(commandFromItem).filter((s) => s.length > 0);
    if (parts.length > 0) return redactCommand(parts.join("\n"));
  }
  if (typeof toolInput?.code === "string" && toolInput.code.length < 2048) return redactCommand(toolInput.code);
  return undefined;
}

export function sanitizeTarget(v: string | undefined, fallback = "unknown"): string {
  const s = sanitizeString(v ?? "", MAX_TARGET_LENGTH);
  return s.length > 0 ? s : fallback;
}

export function urlOf(payload: HookPayload | undefined): string | undefined {
  if (!payload) return undefined;
  const url = firstString(toolInputOf(payload), "url", "uri") ?? firstString(payload, "url", "uri");
  return url ? redactString(url, false) : undefined;
}

export function isFailure(payload: HookPayload): boolean {
  const response = responseOf(payload);
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
  const response = responseOf(payload);
  const exit = num(payload.exit_code ?? payload.exitCode ?? response?.exit_code ?? response?.exit ?? response?.exitCode);
  return exit !== undefined ? Math.trunc(exit) : undefined;
}

const REDACT_DEPTH = 3;
const MAX_REDACT_ARRAY_ITEMS = 64;
const PLACEHOLDER = "[REDACTED]";

/**
 * Recursively masks likely secret values in a raw agent payload. Applied
 * before the payload is written to disk (ingest) and when it is read back
 * (inbox tail), so secrets never sit in the spool unredacted. Keys whose
 * names match a sensitive stem have their whole value replaced; `command`/
 * `cmd`/`shell_command`/`code` values are redacted as commands; `url`/`uri`
 * values keep only their secret query parameters masked. Idempotent:
 * already-redacted values are left untouched.
 */
export function redactPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return walkPayload(payload, 0) as Record<string, unknown>;
}

function walkPayload(value: unknown, depth: number): unknown {
  if (depth > REDACT_DEPTH) return value;
  if (Array.isArray(value)) {
    return value.slice(0, MAX_REDACT_ARRAY_ITEMS).map((v) => walkPayload(v, depth + 1));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === "string") {
        if (isSensitiveKeyMatch(k)) out[k] = v === PLACEHOLDER ? v : PLACEHOLDER;
        else if (k === "command" || k === "cmd" || k === "shell_command" || k === "code") out[k] = redactCommand(v);
        else if (k === "url" || k === "uri") out[k] = redactString(v, false);
        else out[k] = v;
      } else {
        out[k] = walkPayload(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}
