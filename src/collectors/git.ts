import { execFileSync } from "child_process";

export interface GitStatusEntry {
  x: string;
  y: string;
  path: string;
  origPath?: string;
}

const GIT_TIMEOUT_MS = 8000;
const GIT_MAX_BUFFER = 16 * 1024 * 1024;

function runGit(cwd: string, args: string[]): string | null {
  try {
    const out = execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      timeout: GIT_TIMEOUT_MS,
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: GIT_MAX_BUFFER,
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