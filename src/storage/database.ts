import DatabaseModule from "better-sqlite3";
import type { AILogEvent } from "../core/events";
import type { Actor, Category, Risk } from "../core/constants";
import { MIGRATIONS } from "./migrations";

export interface SessionRow {
  id: string;
  repository: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  branch: string | null;
  head: string | null;
  meta: string | null;
}

export interface EventRow {
  id: string;
  timestamp: string;
  session_id: string;
  repository: string;
  actor: Actor;
  category: Category;
  action: string;
  target: string | null;
  metadata: string | null;
  source: string;
  confidence: number;
  risk: Risk;
  observed: number;
}

export interface EventQuery {
  sessionId?: string;
  category?: Category;
  action?: string;
  actor?: Actor;
  risk?: Risk;
  limit?: number;
  after?: string;
}

export class Database {
  private db: DatabaseModule.Database;

  constructor(dbPath: string) {
    this.db = new DatabaseModule(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("synchronous = NORMAL");
    this.migrate();
  }

  private migrate(): void {
    let version = this.db.pragma("user_version", { simple: true }) as number;
    while (version < MIGRATIONS.length) {
      this.db.exec("BEGIN");
      try {
        this.db.exec(MIGRATIONS[version]);
        version += 1;
        this.db.pragma(`user_version = ${version}`);
        this.db.exec("COMMIT");
      } catch (err) {
        this.db.exec("ROLLBACK");
        throw err;
      }
    }
  }

  // ---- sessions ----

  insertSession(session: SessionRow): void {
    this.db
      .prepare(
        `INSERT INTO sessions (id, repository, started_at, ended_at, status, branch, head, meta)
         VALUES (@id, @repository, @started_at, @ended_at, @status, @branch, @head, @meta)`
      )
      .run(session);
  }

  getActiveSession(repository: string): SessionRow | null {
    const row = this.db
      .prepare(`SELECT * FROM sessions WHERE repository = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1`)
      .get(repository);
    return (row as SessionRow) ?? null;
  }

  getLatestSession(repository: string): SessionRow | null {
    const row = this.db.prepare(`SELECT * FROM sessions WHERE repository = ? ORDER BY started_at DESC LIMIT 1`).get(repository);
    return (row as SessionRow) ?? null;
  }

  closeActiveSessions(repository: string, endedAt: string): void {
    this.db
      .prepare(`UPDATE sessions SET status = 'closed', ended_at = ? WHERE repository = ? AND status = 'active'`)
      .run(endedAt, repository);
  }

  closeSession(id: string, endedAt: string): void {
    this.db.prepare(`UPDATE sessions SET status = 'closed', ended_at = ? WHERE id = ?`).run(endedAt, id);
  }

  listSessions(repository: string, limit = 20): SessionRow[] {
    return this.db
      .prepare(`SELECT * FROM sessions WHERE repository = ? ORDER BY started_at DESC LIMIT ?`)
      .all(repository, limit) as SessionRow[];
  }

  updateSessionHead(id: string, head: string | null, branch: string | null): void {
    this.db.prepare(`UPDATE sessions SET head = ?, branch = ? WHERE id = ?`).run(head, branch, id);
  }

  // ---- events ----

  insertEvent(event: AILogEvent): void {
    this.db
      .prepare(
        `INSERT INTO events
          (id, timestamp, session_id, repository, actor, category, action, target, metadata, source, confidence, risk, observed)
         VALUES
          (@id, @timestamp, @sessionId, @repository, @actor, @category, @action, @target, @metadata, @source, @confidence, @risk, @observed)`
      )
      .run({
        id: event.id,
        timestamp: event.timestamp,
        sessionId: event.sessionId,
        repository: event.repository,
        actor: event.actor,
        category: event.category,
        action: event.action,
        target: event.target ?? null,
        metadata: event.metadata ? JSON.stringify(event.metadata) : null,
        source: event.source,
        confidence: event.confidence,
        risk: event.risk,
        observed: event.observed ? 1 : 0,
      });
  }

  insertEvents(events: AILogEvent[]): void {
    if (events.length === 0) return;
    const tx = this.db.transaction((list: AILogEvent[]) => {
      for (const e of list) this.insertEvent(e);
    });
    tx(events);
  }

  countEvents(sessionId: string): number {
    const row = this.db.prepare(`SELECT COUNT(*) AS n FROM events WHERE session_id = ?`).get(sessionId) as { n: number };
    return row.n;
  }

  queryEvents(q: EventQuery): EventRow[] {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (q.sessionId) {
      where.push("session_id = ?");
      params.push(q.sessionId);
    }
    if (q.category) {
      where.push("category = ?");
      params.push(q.category);
    }
    if (q.action) {
      where.push("action = ?");
      params.push(q.action);
    }
    if (q.actor) {
      where.push("actor = ?");
      params.push(q.actor);
    }
    if (q.risk && q.risk !== "none") {
      where.push("risk = ?");
      params.push(q.risk);
    }
    if (q.after) {
      where.push("timestamp >= ?");
      params.push(q.after);
    }
    const limit = Math.min(Math.max(q.limit ?? 100, 1), 5000);
    const sql = `SELECT * FROM events ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY timestamp ASC LIMIT ?`;
    return this.db.prepare(sql).all(...params, limit) as EventRow[];
  }

  recentEvents(sessionId: string, limit: number): EventRow[] {
    return this.queryEvents({ sessionId, limit });
  }

  lastEvent(sessionId: string): EventRow | null {
    const row = this.db
      .prepare(`SELECT * FROM events WHERE session_id = ? ORDER BY timestamp DESC LIMIT 1`)
      .get(sessionId);
    return (row as EventRow) ?? null;
  }

  // ---- dependency snapshots ----

  getLastDepSnapshot(sessionId: string): { id: number; recorded_at: string; data: string } | null {
    const row = this.db
      .prepare(`SELECT * FROM dep_snapshots WHERE session_id = ? ORDER BY recorded_at DESC, id DESC LIMIT 1`)
      .get(sessionId);
    return (row as { id: number; recorded_at: string; data: string }) ?? null;
  }

  insertDepSnapshot(sessionId: string, recordedAt: string, data: string): void {
    this.db
      .prepare(`INSERT INTO dep_snapshots (session_id, recorded_at, data) VALUES (?, ?, ?)`)
      .run(sessionId, recordedAt, data);
  }

  // ---- maintenance ----

  close(): void {
    this.db.close();
  }

  clearEvents(): void {
    const tx = this.db.transaction(() => {
      this.db.exec("DELETE FROM events");
      this.db.exec("DELETE FROM dep_snapshots");
      this.db.exec("DELETE FROM sessions");
    });
    tx();
  }
}

export function rowToEvent(row: EventRow): AILogEvent {
  return {
    id: row.id,
    timestamp: row.timestamp,
    sessionId: row.session_id,
    repository: row.repository,
    actor: row.actor,
    category: row.category,
    action: row.action,
    target: row.target ?? undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    source: row.source as AILogEvent["source"],
    confidence: row.confidence,
    risk: row.risk,
    observed: row.observed === 1,
  };
}