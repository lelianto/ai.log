import type { Database, SessionRow } from "../storage/database";
import { newSessionId } from "./constants";
import { gitBranch, gitHead, gitStatusPorcelain, type GitStatusEntry } from "../collectors/git";

export interface StartSessionResult {
  session: SessionRow;
  baseline: GitStatusEntry[];
}

export function startSession(db: Database, repository: string, now = new Date()): StartSessionResult {
  const iso = now.toISOString();
  db.closeActiveSessions(repository, iso);
  const branch = gitBranch(repository);
  const head = gitHead(repository);
  const baseline = gitStatusPorcelain(repository);
  const session: SessionRow = {
    id: newSessionId(),
    repository,
    started_at: iso,
    ended_at: null,
    status: "active",
    branch,
    head,
    meta: JSON.stringify({ baselinePathSet: baseline.map((e) => e.path), baselineHead: head ?? null }),
  };
  db.insertSession(session);
  return { session, baseline };
}

export function stopSession(db: Database, sessionId: string, now = new Date()): void {
  db.closeSession(sessionId, now.toISOString());
}