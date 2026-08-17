import type { Actor, Category, Risk, Source } from "./constants";
import { isActor, isCategory, isRisk, isSource, newId } from "./constants";

export const MAX_TARGET_LENGTH = 1024;
export const MAX_ACTION_LENGTH = 128;
export const MAX_METADATA_BYTES = 64 * 1024;

export interface AILogEvent {
  id: string;
  timestamp: string;
  sessionId: string;
  repository: string;
  actor: Actor;
  category: Category;
  action: string;
  target?: string;
  metadata?: Record<string, unknown>;
  source: Source;
  confidence: number;
  risk: Risk;
  observed: boolean;
}

export interface RawEvent {
  timestamp?: unknown;
  sessionId?: unknown;
  repository?: unknown;
  actor?: unknown;
  category?: unknown;
  action?: unknown;
  target?: unknown;
  metadata?: unknown;
  source?: unknown;
  confidence?: unknown;
  risk?: unknown;
  observed?: unknown;
  [key: string]: unknown;
}

const ANSI_RE = /\u001b\[[0-9;?]*[ -\/]*[@-~]/g;
const CONTROL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

export function sanitizeString(value: string, maxLen: number): string {
  let s = value.replace(ANSI_RE, "").replace(CONTROL_RE, "");
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

export function sanitizeMetadata(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined;
  try {
    const text = JSON.stringify(value);
    if (!text || text.length > MAX_METADATA_BYTES) {
      return { truncated: true, error: "metadata too large" };
    }
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { value: sanitizeString(String(parsed), MAX_TARGET_LENGTH) };
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      out[sanitizeString(k, 256)] = sanitizeJsonValue(v);
    }
    return out;
  } catch {
    return { error: "invalid metadata" };
  }
}

function sanitizeJsonValue(v: unknown): unknown {
  if (typeof v === "string") {
    if (v.length > MAX_TARGET_LENGTH) {
      return { redacted: true, reason: "value too large" };
    }
    return sanitizeString(v, MAX_TARGET_LENGTH);
  }
  if (Array.isArray(v)) return v.slice(0, 64).map(sanitizeJsonValue);
  if (v !== null && typeof v === "object") return sanitizeMetadata(v);
  return v;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateEvent(e: RawEvent): ValidationResult {
  const errors: string[] = [];
  if (typeof e.timestamp !== "string" || Number.isNaN(Date.parse(e.timestamp))) {
    errors.push("timestamp must be an ISO-8601 string");
  }
  if (typeof e.sessionId !== "string" || e.sessionId.length === 0) {
    errors.push("sessionId is required");
  }
  if (typeof e.repository !== "string" || e.repository.length === 0) {
    errors.push("repository is required");
  }
  if (!isActor(e.actor)) errors.push(`actor must be one of ${"human,claude,codex,opencode,gemini,cursor,system,unknown"}`);
  if (!isCategory(e.category)) errors.push("category is invalid");
  if (typeof e.action !== "string" || e.action.length === 0) errors.push("action is required");
  if (!isSource(e.source)) errors.push("source is invalid");
  if (!isRisk(e.risk ?? "none")) errors.push("risk is invalid");
  const confidence = e.confidence;
  if (typeof confidence !== "number" || Number.isNaN(confidence) || confidence < 0 || confidence > 1) {
    errors.push("confidence must be a number in [0,1]");
  }
  return { ok: errors.length === 0, errors };
}

export interface NewEventInput {
  sessionId: string;
  repository: string;
  actor: Actor;
  category: Category;
  action: string;
  source: Source;
  target?: string;
  metadata?: Record<string, unknown>;
  confidence?: number;
  risk?: Risk;
  observed?: boolean;
  timestamp?: string;
  id?: string;
}

export function newEvent(input: NewEventInput): AILogEvent {
  return {
    id: typeof input.id === "string" ? sanitizeString(input.id, 128) : newId(),
    timestamp: input.timestamp ?? new Date().toISOString(),
    sessionId: input.sessionId,
    repository: input.repository,
    actor: input.actor,
    category: input.category,
    action: sanitizeString(input.action, MAX_ACTION_LENGTH),
    target: input.target ? sanitizeString(input.target, MAX_TARGET_LENGTH) : undefined,
    metadata: input.metadata ? sanitizeMetadata(input.metadata) : undefined,
    source: input.source,
    confidence: input.confidence ?? 0.5,
    risk: input.risk ?? "none",
    observed: input.observed ?? false,
  };
}

export function normalizeEvent(raw: RawEvent): AILogEvent | null {
  const { timestamp, sessionId, repository, actor, category, action, source, confidence, observed } = raw;
  if (typeof timestamp !== "string" || typeof sessionId !== "string" || typeof repository !== "string") return null;
  if (!isActor(actor) || !isCategory(category) || !isSource(source)) return null;
  if (typeof action !== "string" || action.length === 0) return null;
  const conf = typeof confidence === "number" && !Number.isNaN(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5;
  const target = typeof raw.target === "string" ? raw.target : undefined;
  const risk = raw.risk ?? "none";
  if (!isRisk(risk)) return null;

  const event: AILogEvent = {
    id: typeof raw.id === "string" && raw.id.length <= 128 ? sanitizeString(raw.id, 128) : newId(),
    timestamp: new Date(timestamp).toISOString(),
    sessionId: sanitizeString(sessionId, 128),
    repository: sanitizeString(repository, 1024),
    actor,
    category,
    action: sanitizeString(action, MAX_ACTION_LENGTH),
    target: target ? sanitizeString(target, MAX_TARGET_LENGTH) : undefined,
    metadata: raw.metadata ? sanitizeMetadata(raw.metadata) : undefined,
    source,
    confidence: conf,
    risk,
    observed: observed === true,
  };
  return event;
}