import * as path from "path";
import { Database } from "../storage/database";
import { DB_FILE } from "../core/paths";
import { ensureAilogDir, findProjectDir } from "../core/project";

export interface ProjectDirs {
  repoDir: string;
  ailogDir: string;
}

/**
 * Resolves the project from the current directory and verifies it is
 * initialized. On failure prints the standard message and exits 1.
 */
export function requireProjectDir(cwd = process.cwd()): ProjectDirs {
  let repoDir: string;
  try {
    repoDir = findProjectDir(cwd);
  } catch {
    fail("no .ailog directory found in this workspace.\nRun \"ai.log init\" first.");
  }
  const ailogDir = ensureAilogDir(repoDir);
  return { repoDir, ailogDir };
}

/** Prints an `ai.log:` error and exits with code 1. */
export function fail(msg: string): never {
  console.error(`ai.log: ${msg}`);
  process.exit(1);
}

export function openDb(ailogDir: string): Database {
  return new Database(path.join(ailogDir, DB_FILE));
}

export function agentStatusLine(installed: string[], skipped: string[], agents: readonly string[]): string {
  return agents
    .map((a) => {
      const status = installed.includes(a) ? "installed" : skipped.includes(a) ? "disabled" : "not installed";
      return `  ${a}: ${status}`;
    })
    .join("\n");
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
}

export function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "\u2026";
}

export function clamp(n: number, lo: number, hi: number): number {
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
}
