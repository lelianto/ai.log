import { execFileSync } from "child_process";

export interface GitStatusEntry {
  x: string;
  y: string;
  path: string;
  origPath?: string;
}

export interface GitNumstatLine {
  path: string;
  added: number;
  deleted: number;
}

function runGit(cwd: string, args: string[]): string | null {
  try {
    const out = execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      timeout: 8000,
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 16 * 1024 * 1024,
    });
    return out;
  } catch {
    return null;
  }
}

export function gitStatusPorcelain(cwd: string): GitStatusEntry[] {
  const out = runGit(cwd, ["status", "--porcelain", "-z", "--"]);
  if (out === null) return [];
  const entries: GitStatusEntry[] = [];
  const parts = out.split("\0");
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.length < 3) continue;
    const x = part[0];
    const y = part[1];
    const path = part.slice(3);
    if (x === "R" || x === "C") {
      const origPath = parts[i + 1] ?? "";
      entries.push({ x, y, path, origPath });
      i += 1;
    } else {
      entries.push({ x, y, path });
    }
  }
  return entries;
}

export function gitNumstat(cwd: string, staged = false): GitNumstatLine[] {
  const args = ["diff", "--numstat", "-z"];
  if (staged) args.push("--cached");
  args.push("--");
  const out = runGit(cwd, args);
  if (out === null) return [];
  const lines: GitNumstatLine[] = [];
  const parts = out.split("\0");
  for (let i = 0; i + 2 < parts.length; i += 3) {
    const added = Number.parseInt(parts[i], 10);
    const deleted = Number.parseInt(parts[i + 1], 10);
    const path = parts[i + 2];
    if (path) lines.push({ path, added: Number.isNaN(added) ? 0 : added, deleted: Number.isNaN(deleted) ? 0 : deleted });
  }
  return lines;
}

export function gitBranch(cwd: string): string | null {
  const out = runGit(cwd, ["branch", "--show-current"]);
  if (out === null) return null;
  const b = out.trim();
  return b.length > 0 && b !== "HEAD" ? b : null;
}

export function gitHead(cwd: string): string | null {
  const out = runGit(cwd, ["rev-parse", "HEAD"]);
  return out ? out.trim() : null;
}

export interface GitSnapshot {
  branch: string | null;
  head: string | null;
  status: GitStatusEntry[];
  hasGit: boolean;
}

export function gitSnapshot(cwd: string): GitSnapshot {
  const branch = gitBranch(cwd);
  const head = gitHead(cwd);
  const status = gitStatusPorcelain(cwd);
  return { branch, head, status, hasGit: branch !== null || head !== null };
}

export function isGitRepo(cwd: string): boolean {
  return runGit(cwd, ["rev-parse", "--is-inside-work-tree"])?.trim() === "true";
}

export function gitRootOf(cwd: string): string | null {
  const out = runGit(cwd, ["rev-parse", "--show-toplevel"]);
  if (out === null) return null;
  const first = out.split("\n")[0] ?? "";
  const root = first.trim();
  return root.length > 0 ? root : null;
}