import * as fs from "fs";
import * as path from "path";

export const AILOG_DIR = ".ailog";
export const INBOX_DIR = "inbox";
export const SESSIONS_DIR = "sessions";
export const CONFIG_FILE = "config.json";
export const DB_FILE = "events.db";
export const DAEMON_PID_FILE = "daemon.pid";
export const DAEMON_LOG_FILE = "daemon.log";
export const OFFSETS_FILE = ".offsets.json";

export function findAilogDir(startDir: string): string | null {
  let dir = path.resolve(startDir);
  for (;;) {
    const candidate = path.join(dir, AILOG_DIR);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function gitRoot(startDir: string): string | null {
  const { execFileSync } = require("child_process");
  try {
    const out = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: startDir,
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.trim();
  } catch {
    return null;
  }
}

export function safeJoin(base: string, rel: string): string | null {
  const target = path.resolve(base, rel);
  if (target !== base && !target.startsWith(base + path.sep)) return null;
  return target;
}