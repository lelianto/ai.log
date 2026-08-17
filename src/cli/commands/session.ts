import * as path from "path";
import { requireProjectDir, openDb, fail } from "../util";
import { isDaemonRunning } from "../../core/project";
import { spawnDaemon } from "../../daemon/spawn";
import { isPidAlive, readDaemonPid } from "../../daemon/state";

export function runStart(): void {
  const { repoDir, ailogDir } = requireProjectDir();

  if (isDaemonRunning(ailogDir)) {
    const pid = readDaemonPid(ailogDir);
    console.log(`ai.log is already running (pid ${pid}).`);
    console.log(`Run "ai.log" to see activity, or "ai.log status" for details.`);
    process.exit(1);
  }

  let spawned: { pid: number; logFile: string };
  try {
    spawned = spawnDaemon(ailogDir, repoDir);
  } catch (err) {
    fail(String(err));
  }

  waitForSession(ailogDir, repoDir, spawned.pid, () => {
    console.log("\u2713 ai.log started\n");
    console.log("Project\n" + repoDir + "\n");

    const db = openDb(ailogDir);
    const session = db.getActiveSession(repoDir);
    db.close();
    if (session) {
      console.log(`Session\n${session.id}\n`);
    }

    console.log("Watching\nfilesystem\ngit\nprocess activity\n");
    console.log("Run:\n\n  ai.log\n\nto see AI activity.");
  });
}

function waitForSession(ailogDir: string, repoDir: string, pid: number, cb: () => void): void {
  const deadline = Date.now() + 5000;
  const check = (): void => {
    if (!isPidAlive(pid)) {
      fail(`daemon exited during startup. Check ${path.join(ailogDir, "daemon.log")}`);
    }
    const db = openDb(ailogDir);
    const session = db.getActiveSession(repoDir);
    db.close();
    if (session || Date.now() > deadline) {
      cb();
      return;
    }
    setTimeout(check, 120);
  };
  check();
}

export function runStop(): void {
  const { ailogDir } = requireProjectDir();
  const pid = readDaemonPid(ailogDir);

  if (pid === null || !isPidAlive(pid)) {
    console.log("ai.log is not running.");
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // fall through
  }

  const deadline = Date.now() + 4000;
  const wait = (): void => {
    if (isPidAlive(pid)) {
      if (Date.now() < deadline) {
        setTimeout(wait, 100);
      } else {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // already gone
        }
        console.log("\u2713 ai.log stopped (forced).");
      }
      return;
    }
    console.log("\u2713 ai.log stopped.");
  };
  wait();
}
