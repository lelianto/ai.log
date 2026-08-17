import * as path from "path";
import { execFileSync } from "child_process";
import { requireProjectDir, openDb, fail } from "../util";
import { rowToEvent } from "../../storage/database";
import type { AILogEvent } from "../../core/events";

/**
 * `ai.log undo` - revert what an agent changed during a session.
 *
 * Uses the git HEAD recorded when the session started as the restore point
 * and restores exactly the files the agent touched during that session.
 * Never touches .ailog, never rewrites history, never runs an interactive
 * pager. Requires confirmation unless --yes is given.
 */

interface UndoPlan {
  files: string[];
  created: string[];
  modified: string[];
  deleted: string[];
}

export function runUndo(flags: Map<string, string | boolean>): void {
  const { repoDir, ailogDir } = requireProjectDir();
  const db = openDb(ailogDir);

  try {
    const sessionId = typeof flags.get("session") === "string" ? (flags.get("session") as string) : undefined;
    const session = sessionId ? db.getSession(sessionId) : db.getActiveSession(repoDir) ?? db.getLatestSession(repoDir);
    if (!session) {
      console.log("ai.log: no session to undo.");
      return;
    }

    const head = baselineHeadOf(session) ?? session.head;
    if (!head) {
      fail("session has no recorded start commit. Undo needs a Git commit to restore to.");
    }

    const events = db.recentEvents(session.id, 5000).map(rowToEvent);
    const touched = filesTouchedBy(events);
    if (touched.length === 0) {
      console.log("ai.log: this session recorded no file changes to undo.");
      return;
    }

    const plan = planUndo(repoDir, head, touched);

    console.log("ai.log undo");
    console.log("".padEnd(46, "\u2500"));
    console.log();
    console.log(`Session\n${session.id}`);
    console.log();
    console.log(`Restore point\n${head}\n`);

    if (plan.modified.length === 0 && plan.created.length === 0 && plan.deleted.length === 0) {
      console.log("No working-tree changes to revert (files already match the restore point).");
      return;
    }

    console.log("Will restore");
    console.log("".padEnd(46, "\u2500"));
    if (plan.modified.length > 0) {
      console.log("Modified");
      console.log(`  ${plan.modified.join("\n  ")}`);
      console.log();
    }
    if (plan.deleted.length > 0) {
      console.log("Deleted");
      console.log(`  ${plan.deleted.join("\n  ")}`);
      console.log();
    }
    if (plan.created.length > 0) {
      console.log("Created during session (will be removed)");
      console.log(`  ${plan.created.join("\n  ")}`);
      console.log();
    }

    if (flags.get("yes") !== true) {
      process.stdout.write("Revert these changes? This cannot be undone. [y/N] ");
      let answer: string;
      try {
        answer = require("fs").readFileSync(0, { encoding: "utf8" });
      } catch {
        fail("could not read confirmation from stdin.");
      }
      if (!/^y(es)?$/i.test(answer.trim())) {
        console.log("Aborted.");
        process.exit(1);
      }
    }

    const result = applyUndo(repoDir, head, plan);
    console.log();
    if (result.errors.length > 0) {
      console.log(`\u2713 Reverted ${result.applied.length} file(s).`);
      console.log(`\u26a0 ${result.errors.length} file(s) could not be restored:`);
      for (const e of result.errors) console.log(`  ${e}`);
      process.exit(1);
    }
    console.log(`\u2713 Reverted ${result.applied.length} file(s) to ${head}.`);
  } finally {
    db.close();
  }
}

function filesTouchedBy(events: AILogEvent[]): string[] {
  const set = new Set<string>();
  for (const e of events) {
    if (e.category !== "filesystem") continue;
    if (!e.target || e.target === "(unknown)") continue;
    if (e.target.startsWith(".ailog/")) continue;
    set.add(e.target);
  }
  return [...set].sort();
}

export function baselineHeadOf(session: { meta: string | null; head: string | null }): string | null {
  if (!session.meta) return session.head;
  try {
    const meta = JSON.parse(session.meta) as { baselineHead?: string | null };
    if (typeof meta.baselineHead === "string" && meta.baselineHead.length > 0) return meta.baselineHead;
  } catch {
    // fall through
  }
  return session.head;
}

export function planUndo(repoDir: string, head: string, files: string[]): UndoPlan {
  const modified: string[] = [];
  const deleted: string[] = [];
  const created: string[] = [];

  for (const file of files) {
    const rel = file;
    const abs = path.join(repoDir, rel);
    const inHead = catFile(repoDir, head, rel);
    const existsNow = fsExists(abs);

    if (inHead && existsNow) {
      // Exists in both - only matters if content differs
      if (!sameAsHead(repoDir, head, rel)) modified.push(rel);
    } else if (inHead && !existsNow) {
      deleted.push(rel);
    } else if (!inHead && existsNow) {
      created.push(rel);
    }
  }

  return { files, modified, deleted, created };
}

function applyUndo(repoDir: string, head: string, plan: UndoPlan): { applied: string[]; errors: string[] } {
  const applied: string[] = [];
  const errors: string[] = [];

  for (const rel of plan.modified) {
    try {
      execFileSync("git", ["checkout", head, "--", rel], { cwd: repoDir, stdio: "ignore" });
      applied.push(rel);
    } catch {
      errors.push(rel);
    }
  }
  for (const rel of plan.deleted) {
    try {
      execFileSync("git", ["checkout", head, "--", rel], { cwd: repoDir, stdio: "ignore" });
      applied.push(rel);
    } catch {
      errors.push(rel);
    }
  }
  for (const rel of plan.created) {
    const abs = path.join(repoDir, rel);
    try {
      require("fs").unlinkSync(abs);
      applied.push(rel);
    } catch {
      errors.push(rel);
    }
  }

  return { applied, errors };
}

function catFile(repoDir: string, head: string, rel: string): boolean {
  try {
    execFileSync("git", ["cat-file", "-e", `${head}:${rel}`], { cwd: repoDir, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function sameAsHead(repoDir: string, head: string, rel: string): boolean {
  try {
    const current = require("fs").readFileSync(path.join(repoDir, rel), "utf8");
    const headContent = execFileSync("git", ["show", `${head}:${rel}`], { cwd: repoDir, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    return current === headContent;
  } catch {
    return false;
  }
}

function fsExists(p: string): boolean {
  try {
    require("fs").accessSync(p);
    return true;
  } catch {
    return false;
  }
}