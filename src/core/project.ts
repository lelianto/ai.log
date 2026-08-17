import * as fs from "fs";
import * as path from "path";
import { AILOG_DIR } from "./paths";
import { stalePid } from "../daemon/state";

export function isDaemonRunning(ailogDir: string): boolean {
  return stalePid(ailogDir) !== null;
}

export function ensureAilogDir(repoDir: string): string {
  const ailogDir = path.join(repoDir, AILOG_DIR);
  if (!fs.existsSync(ailogDir) || !fs.statSync(ailogDir).isDirectory()) {
    console.error(`ai.log: not initialized in ${repoDir}\nRun "ai.log init" first.`);
    process.exit(1);
  }
  return ailogDir;
}

export function findProjectDir(cwd: string): string {
  let dir = path.resolve(cwd);
  for (;;) {
    if (fs.existsSync(path.join(dir, AILOG_DIR))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`ai.log: no .ailog directory found (run "ai.log init" in this workspace)`);
}