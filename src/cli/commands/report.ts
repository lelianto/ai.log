import { requireProjectDir, openDb, truncate } from "../util";
import { rowToEvent } from "../../storage/database";
import type { AILogEvent } from "../../core/events";

/**
 * `ai.log report` - aggregate activity across sessions within a period
 * (daily / weekly / all). Shows per-actor and per-category totals, files
 * changed, commands, errors, and security events.
 */
export function runReport(flags: Map<string, string | boolean>): void {
  const { ailogDir } = requireProjectDir();
  const db = openDb(ailogDir);

  try {
    const period = typeof flags.get("period") === "string" ? (flags.get("period") as string) : "daily";
    const since = periodStart(period);
    if (since === INVALID_PERIOD) {
      console.error(`ai.log: unknown period "${period}" (use: daily, weekly, all).`);
      process.exit(1);
    }

    const rows = db.queryEvents(since ? { after: since } : {});
    const events = rows.map(rowToEvent);

    if (flags.get("json") === true) {
      console.log(
        JSON.stringify(
          {
            period,
            since,
            events,
          },
          null,
          2
        )
      );
      return;
    }

    renderReport(period, since, events);
  } finally {
    db.close();
  }
}

const INVALID_PERIOD = Symbol("invalid-period");

export function periodStart(period: string): string | null | typeof INVALID_PERIOD {
  const now = new Date();
  let start: Date;
  switch (period) {
    case "daily":
    case "day":
      start = new Date(now);
      start.setHours(0, 0, 0, 0);
      break;
    case "weekly":
    case "week":
      start = new Date(now);
      const day = (start.getDay() + 6) % 7;
      start.setDate(start.getDate() - day);
      start.setHours(0, 0, 0, 0);
      break;
    case "all":
      return null;
    default:
      return INVALID_PERIOD;
  }
  return start.toISOString();
}

function renderReport(period: string, since: string | null, events: AILogEvent[]): void {
  const label = since ? new Date(since).toDateString() : "all time";
  console.log("ai.log report");
  console.log("".padEnd(46, "\u2500"));
  console.log();
  console.log(`Period    ${period} (${label})`);
  console.log(`Events    ${events.length}`);
  console.log();

  if (events.length === 0) {
    console.log("No activity in this period.");
    return;
  }

  const actors = new Map<string, number>();
  const categories = new Map<string, number>();
  const files = new Set<string>();
  const commands: string[] = [];
  const errors: string[] = [];
  const security: { target: string; risk: string }[] = [];
  const deps: string[] = [];

  for (const e of events) {
    actors.set(e.actor, (actors.get(e.actor) ?? 0) + 1);
    categories.set(e.category, (categories.get(e.category) ?? 0) + 1);
    if (e.category === "filesystem" && e.target && !e.target.startsWith(".ailog/")) files.add(e.target);
    if (e.category === "command" && e.target) commands.push(e.target);
    if (e.action === "fail" || e.action === "error") errors.push(`${e.actor}: ${truncate(e.target ?? "", 60)}`);
    if (e.risk !== "none") security.push({ target: truncate(e.target ?? "", 60), risk: e.risk });
    if (e.category === "dependency") deps.push(e.target ?? "");
  }

  console.log("By actor");
  for (const [actor, n] of [...actors.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${actor.padEnd(9)} ${n}`);
  }
  console.log();

  console.log("By category");
  for (const [cat, n] of [...categories.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat.padEnd(11)} ${n}`);
  }
  console.log();

  console.log(`Files changed   ${files.size}`);
  if (files.size > 0 && files.size <= 25) {
    for (const f of [...files].sort()) console.log(`  ${f}`);
    console.log();
  }

  console.log(`Commands        ${commands.length}`);
  console.log(`Dependencies    ${deps.length}`);
  if (deps.length > 0) {
    const unique = [...new Set(deps)].slice(0, 20);
    console.log(`  ${unique.join(", ")}`);
  }
  console.log();

  console.log(`Errors          ${errors.length}`);
  for (const err of errors.slice(0, 10)) console.log(`  ${err}`);
  console.log();

  console.log(`Security        ${security.length}`);
  for (const s of security.slice(0, 10)) console.log(`  [${s.risk}] ${s.target}`);
  console.log();
}