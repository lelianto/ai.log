import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { DAEMON_LOG_FILE } from "../core/paths";
import { writeDaemonPid } from "./state";

const DAEMON_ENTRY = path.join(__dirname, "main.js");

export function spawnDaemon(ailogDir: string, repoDir: string): { pid: number; logFile: string } {
  const logFile = path.join(ailogDir, DAEMON_LOG_FILE);
  const logFd = fs.openSync(logFile, "a");

  const child = spawn(process.execPath, [DAEMON_ENTRY, repoDir], {
    cwd: repoDir,
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });

  child.unref();
  fs.closeSync(logFd);

  if (child.pid === undefined) {
    throw new Error("failed to spawn ai.log daemon");
  }
  writeDaemonPid(ailogDir, child.pid);
  return { pid: child.pid, logFile };
}