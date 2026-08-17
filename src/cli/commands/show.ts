import { requireProjectDir, openDb, formatTime, truncate, clamp } from "../util";
import { rowToEvent } from "../../storage/database";
import type { SessionRow } from "../../storage/database";
import type { AILogEvent } from "../../core/events";

export function runShow(flags: Map<string, string | boolean>): void {
  const { repoDir, ailogDir } = requireProjectDir();

  const db = openDb(ailogDir);
  try {
    const session = db.getActiveSession(repoDir) ?? db.getLatestSession(repoDir);
    if (!session) {
      console.log("ai.log: no session recorded yet.\nRun \"ai.log start\" before using your AI agents.");
      return;
    }

    const limit = typeof flags.get("limit") === "string" ? clamp(parseInt(flags.get("limit") as string, 10), 10, 20000) : 500;
    const events = db.recentEvents(session.id, limit).map(rowToEvent);

    if (flags.get("json") === true) {
      renderJson(session.id, repoDir, events);
      return;
    }

    const view = viewOf(flags);
    if (view !== null) {
      renderView(view, events);
      return;
    }

    renderText(session as SessionRow, events);
  } finally {
    db.close();
  }
}

function viewOf(flags: Map<string, string | boolean>): "changes" | "commands" | "errors" | "security" | null {
  if (flags.get("changes") === true) return "changes";
  if (flags.get("commands") === true) return "commands";
  if (flags.get("errors") === true) return "errors";
  if (flags.get("security") === true) return "security";
  return null;
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

function renderView(view: "changes" | "commands" | "errors" | "security", events: AILogEvent[]): void {
  console.log(view.toUpperCase());
  console.log("".padEnd(46, "\u2500"));
  console.log();
  const filtered = events.filter((e) => viewMatches(view, e));
  if (filtered.length === 0) {
    console.log(`No ${view} recorded in this session.`);
    return;
  }

  if (view === "changes") {
    const byTarget = new Map<string, { actions: Set<string>; actors: Set<string> }>();
    for (const e of filtered) {
      const key = e.target ?? "(unknown)";
      const entry = byTarget.get(key) ?? { actions: new Set(), actors: new Set() };
      entry.actions.add(e.action);
      entry.actors.add(e.actor);
      byTarget.set(key, entry);
    }
    const lines = [...byTarget.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [target, entry] of lines) {
      const actions = [...entry.actions].sort().join("/");
      const actors = [...entry.actors].join(", ");
      console.log(`${actions.padEnd(10)} ${truncate(target, 36).padEnd(38)} ${actors}`);
    }
    console.log();
    console.log(`${lines.length} files changed`);
    return;
  }

  const shown = filtered.slice(-60);
  for (const e of shown) {
    const time = formatTime(e.timestamp);
    const risk = e.risk !== "none" ? ` [${e.risk}]` : "";
    const meta = commandSnippet(e) ?? "";
    console.log(`${time}  ${e.actor.padEnd(9)} ${e.action.padEnd(11)} ${meta || truncate(e.target ?? "", 30)}${risk}`);
  }
  if (filtered.length > shown.length) {
    console.log(`\n... ${filtered.length - shown.length} more ...`);
  }
  console.log();
  console.log(`${filtered.length} events`);
}

function viewMatches(view: "changes" | "commands" | "errors" | "security", e: AILogEvent): boolean {
  switch (view) {
    case "changes":
      return e.category === "filesystem" && ["create", "write", "delete", "move", "rename"].includes(e.action);
    case "commands":
      return e.category === "command" || e.action === "execute" || e.category === "network";
    case "errors":
      return e.action === "fail" || e.action === "error";
    case "security":
      return e.risk !== "none";
  }
}

function commandSnippet(e: AILogEvent): string | null {
  if (e.category !== "command") return null;
  const status = e.metadata?.exitCode !== undefined ? `(exit ${e.metadata.exitCode})` : "";
  return `${truncate(e.target ?? "", 40)} ${status}`;
}

function renderText(session: SessionRow, events: AILogEvent[]): void {
  console.log("ai.log");
  console.log("".padEnd(46, "\u2500"));
  console.log();
  console.log(`Session\n${session.id}`);
  console.log();
  console.log(`Started\n${formatTime(session.started_at)}`);
  console.log();
  const ended = session.ended_at ? new Date(session.ended_at).getTime() : Date.now();
  const duration = Math.max(0, Math.round((ended - new Date(session.started_at).getTime()) / 60000));
  console.log(`Duration\n${duration} min`);
  console.log();

  const actors = [...new Set(events.map((e) => e.actor))].filter((a) => a !== "unknown").sort();
  const byCategory = new Map<string, number>();
  for (const e of events) {
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + 1);
  }
  const summary = [...byCategory.entries()].map(([c, n]) => `${n} ${c}`).join(", ");
  console.log(`Summary\n${summary}`);
  if (actors.length > 0) {
    console.log();
    console.log(`Actors\n${actors.join(", ")}`);
  }
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
