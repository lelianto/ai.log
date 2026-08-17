import * as fs from "fs";
import * as path from "path";
import { DAEMON_PID_FILE } from "../core/paths";

export function daemonPidPath(ailogDir: string): string {
  return path.join(ailogDir, DAEMON_PID_FILE);
}

export function readDaemonPid(ailogDir: string): number | null {
  try {
    const text = fs.readFileSync(daemonPidPath(ailogDir), "utf8").trim();
    const pid = Number.parseInt(text, 10);
    if (!Number.isInteger(pid) || pid <= 0) return null;
    return pid;
  } catch {
    return null;
  }
}

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function writeDaemonPid(ailogDir: string, pid: number): void {
  fs.writeFileSync(daemonPidPath(ailogDir), String(pid) + "\n");
}

export function removeDaemonPid(ailogDir: string): void {
  try {
    fs.unlinkSync(daemonPidPath(ailogDir));
  } catch {
    // ignore
  }
}

export function stalePid(ailogDir: string): number | null {
  const pid = readDaemonPid(ailogDir);
  if (pid === null) return null;
  return isPidAlive(pid) ? pid : null;
}