import { requireProjectDir, openDb, formatTime, truncate, clamp } from "../util";
import { rowToEvent } from "../../storage/database";
import type { SessionRow } from "../../storage/database";
import type { AILogEvent } from "../../core/events";

/**
 * `ai.log replay` - full chronological timeline of a session, including
 * command exit codes, test results, and durations between events. Unlike the
 * default `ai.log` view, nothing is truncated to the last N events.
 */
export function runReplay(flags: Map<string, string | boolean>): void {
  const { repoDir, ailogDir } = requireProjectDir();
  const db = openDb(ailogDir);

  try {
    const sessionId = typeof flags.get("session") === "string" ? (flags.get("session") as string) : undefined;
    const session = sessionId ? db.getSession(sessionId) : db.getActiveSession(repoDir) ?? db.getLatestSession(repoDir);
    if (!session) {
      console.log("ai.log: no session recorded yet.\nRun \"ai.log start\" before using your AI agents.");
      return;
    }

    const limit = typeof flags.get("limit") === "string" ? clamp(parseInt(flags.get("limit") as string, 10), 10, 20000) : 20000;
    const events = db.recentEvents(session.id, limit).map(rowToEvent);

    if (flags.get("json") === true) {
      console.log(JSON.stringify({ session: session.id, repository: repoDir, events }, null, 2));
      return;
    }

    renderReplay(session as SessionRow, events);
  } finally {
    db.close();
  }
}

function renderReplay(session: SessionRow, events: AILogEvent[]): void {
  console.log("ai.log replay");
  console.log("".padEnd(58, "\u2500"));
  console.log();
  console.log(`Session   ${session.id}`);
  console.log(`Started   ${session.started_at}`);
  if (session.branch) console.log(`Branch    ${session.branch}`);
  if (session.head) console.log(`Head      ${session.head}`);
  console.log();

  if (events.length === 0) {
    console.log("No activity recorded yet.");
    return;
  }

  let prev: string | null = null;
  for (const e of events) {
    const time = formatTime(e.timestamp);
    const gap = prev ? gapLabel(prev, e.timestamp) : "";
    prev = e.timestamp;

    const exit = commandExit(e);
    const risk = e.risk !== "none" ? ` [${e.risk}]` : "";
    const target = e.target ? truncate(e.target, 40) : "";
    console.log(`${time} ${gap.padStart(6)}  ${e.actor.padEnd(9)} ${e.action.padEnd(11)} ${exit} ${target}${risk}`);
  }

  console.log();
  console.log("".padEnd(58, "\u2500"));
  console.log();
  console.log(`${events.length} events`);
  console.log(`Session started ${session.started_at}${session.ended_at ? `, ended ${session.ended_at}` : ""}`);
}

function commandExit(e: AILogEvent): string {
  if (e.category !== "command" && e.category !== "test") return "      ";
  const code = e.metadata?.exitCode;
  if (typeof code === "number") return code === 0 ? "exit 0 " : `exit ${code}`;
  if (e.action === "fail") return "FAIL   ";
  if (e.action === "pass") return "PASS   ";
  return "      ";
}

function gapLabel(from: string, to: string): string {
  const ms = Math.max(0, new Date(to).getTime() - new Date(from).getTime());
  if (ms < 1000) return "";
  const s = Math.round(ms / 1000);
  if (s < 60) return `+${s}s`;
  return `+${Math.round(s / 60)}m`;
}