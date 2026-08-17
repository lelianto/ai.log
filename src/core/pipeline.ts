import type { Database } from "../storage/database";
import type { AILogEvent } from "./events";
import { MAX_TARGET_LENGTH, sanitizeMetadata, sanitizeString } from "./events";
import { isActor, isCategory, isRisk, isSource } from "./constants";

export interface Enricher {
  name: string;
  enrich(event: AILogEvent): AILogEvent[];
}

export interface PipelineOptions {
  dedupeWindowMs?: number;
  flushThreshold?: number;
  flushIntervalMs?: number;
}

const DEDUPE_WINDOW_MS = 2000;
const FLUSH_THRESHOLD = 500;
const FLUSH_INTERVAL_MS = 300;

export class EventPipeline {
  private db: Database;
  private buffer: AILogEvent[] = [];
  private dedupe = new Map<string, number>();
  private enrichers: Enricher[] = [];
  private opts: Required<PipelineOptions>;
  private flushTimer: NodeJS.Timeout | null = null;
  private lastFlush = 0;

  constructor(db: Database, opts: PipelineOptions = {}) {
    this.db = db;
    this.opts = {
      dedupeWindowMs: opts.dedupeWindowMs ?? DEDUPE_WINDOW_MS,
      flushThreshold: opts.flushThreshold ?? FLUSH_THRESHOLD,
      flushIntervalMs: opts.flushIntervalMs ?? FLUSH_INTERVAL_MS,
    };
  }

  addEnricher(e: Enricher): void {
    this.enrichers.push(e);
  }

  start(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => this.flush(), this.opts.flushIntervalMs);
    this.flushTimer.unref();
  }

  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
  }

  ingest(input: AILogEvent | null): void {
    if (!input) return;
    const event = sanitizeEvent(input);
    if (!event) return;

    let events: AILogEvent[] = [event];
    for (const e of this.enrichers) {
      events = events.flatMap((ev) => e.enrich(ev));
    }
    for (const ev of events) {
      if (this.isDuplicate(ev)) continue;
      this.buffer.push(ev);
    }
    if (this.buffer.length >= this.opts.flushThreshold) this.flush();
  }

  private isDuplicate(event: AILogEvent): boolean {
    const key = `${event.actor}\u0000${event.category}\u0000${event.action}\u0000${event.target ?? ""}`;
    const last = this.dedupe.get(key);
    const now = Date.parse(event.timestamp);
    if (last !== undefined && now - last < this.opts.dedupeWindowMs) return true;
    this.dedupe.set(key, now);
    if (this.dedupe.size > 4096) {
      const entries = [...this.dedupe.entries()];
      const cutoff = now - this.opts.dedupeWindowMs * 2;
      for (const [k, t] of entries) if (t < cutoff) this.dedupe.delete(k);
    }
    return false;
  }

  flush(force = false): number {
    if (this.buffer.length === 0) return 0;
    const now = Date.now();
    if (!force && now - this.lastFlush < this.opts.flushIntervalMs * 0.5 && this.buffer.length < this.opts.flushThreshold) {
      return 0;
    }
    const batch = this.buffer;
    this.buffer = [];
    this.lastFlush = now;
    try {
      this.db.insertEvents(batch);
    } catch (err) {
      this.buffer = [...batch, ...this.buffer];
      if (this.buffer.length > 10000) this.buffer.length = 5000;
      console.error(`[pipeline] failed to persist ${batch.length} events: ${String(err)}`);
    }
    return batch.length;
  }
}

function sanitizeEvent(input: AILogEvent): AILogEvent | null {
  if (!input || typeof input !== "object") return null;
  if (typeof input.timestamp !== "string" || Number.isNaN(Date.parse(input.timestamp))) return null;
  if (typeof input.sessionId !== "string" || input.sessionId.length === 0) return null;
  if (typeof input.repository !== "string" || input.repository.length === 0) return null;
  if (!isActor(input.actor) || !isCategory(input.category) || !isSource(input.source)) return null;
  if (!isRisk(input.risk)) return null;
  if (typeof input.action !== "string" || input.action.length === 0) return null;
  const conf = typeof input.confidence === "number" && !Number.isNaN(input.confidence) ? Math.min(1, Math.max(0, input.confidence)) : 0.5;
  return {
    id: input.id && input.id.length <= 128 ? sanitizeString(input.id, 128) : input.id,
    timestamp: new Date(input.timestamp).toISOString(),
    sessionId: sanitizeString(input.sessionId, 128),
    repository: sanitizeString(input.repository, 1024),
    actor: input.actor,
    category: input.category,
    action: sanitizeString(input.action, 128),
    target: input.target ? sanitizeString(input.target, MAX_TARGET_LENGTH) : undefined,
    metadata: input.metadata ? sanitizeMetadata(input.metadata) : undefined,
    source: input.source,
    confidence: conf,
    risk: input.risk,
    observed: input.observed === true,
  };
}