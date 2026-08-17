import * as path from "path";
import { findProjectDir, ensureAilogDir } from "../../core/project";
import { Database, rowToEvent } from "../../storage/database";
import type { AILogEvent } from "../../core/events";

export function runShow(flags: Map<string, string | boolean>): void {
  let repoDir: string;
  try {
    repoDir = findProjectDir(process.cwd());
  } catch {
    console.error(`ai.log: no .ailog directory found in this workspace.\nRun "ai.log init" first.`);
    process.exit(1);
  }
  const ailogDir = ensureAilogDir(repoDir);

  const db = new Database(path.join(ailogDir, "events.db"));
  const session = db.getActiveSession(repoDir) ?? db.getLatestSession(repoDir);
  if (!session) {
    console.log("ai.log: no session recorded yet.\nRun \"ai.log start\" before using your AI agents.");
    db.close();
    return;
  }

  const events = db.recentEvents(session.id, 500).map(rowToEvent);

  if (flags.get("json") === true) {
    renderJson(session.id, repoDir, events);
    db.close();
    return;
  }

  renderText(session, events);
  db.close();
}

function renderJson(sessionId: string, repository: string, events: AILogEvent[]): void {
  console.log(
    JSON.stringify(
      {
        session: sessionId,
        repository,
        events,
      },
      null,
      2
    )
  );
}

function renderText(session: { id: string; started_at: string; status: string }, events: AILogEvent[]): void {
  console.log("ai.log");
  console.log("".padEnd(46, "\u2500"));
  console.log();
  console.log(`Session\n${session.id}`);
  console.log();
  console.log(`Started\n${formatTime(session.started_at)}`);
  console.log();
  if (events.length === 0) {
    console.log("No activity recorded yet.");
    console.log();
    console.log("Use Claude Code, Codex, OpenCode, or Gemini CLI and");
    console.log("ai.log will record what they do.");
    return;
  }
  console.log("Activity");
  console.log("".padEnd(46, "\u2500"));
  console.log();
  const shown = events.slice(-40);
  for (const e of shown) {
    const time = formatTime(e.timestamp);
    const actor = e.actor.toUpperCase().padEnd(9);
    const action = e.action.toUpperCase().padEnd(7);
    const target = e.target ? truncate(e.target, 28) : "";
    console.log(`${time}  ${actor} ${action} ${target}`);
  }
  if (events.length > shown.length) {
    console.log(`\n... ${events.length - shown.length} more events ...`);
  }
  console.log();
  console.log("".padEnd(46, "\u2500"));
  console.log();
  console.log(`${events.length} events recorded`);
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "\u2026";
}