import * as path from "path";
import { findProjectDir, ensureAilogDir } from "../../core/project";
import { readDaemonPid, isPidAlive } from "../../daemon/state";
import { Database } from "../../storage/database";
import { loadConfig } from "../../core/config";

export function runStatus(): void {
  let repoDir: string;
  try {
    repoDir = findProjectDir(process.cwd());
  } catch {
    console.error(`ai.log: no .ailog directory found in this workspace.\nRun "ai.log init" first.`);
    process.exit(1);
  }
  const ailogDir = ensureAilogDir(repoDir);

  const pid = readDaemonPid(ailogDir);
  const running = pid !== null && isPidAlive(pid);

  const db = openDb(ailogDir);
  const session = db.getActiveSession(repoDir);
  const lastSession = db.getLatestSession(repoDir);
  const events = session ? db.countEvents(session.id) : 0;
  db.close();

  const config = loadConfig(ailogDir);

  console.log("STATUS\n");
  console.log(`Project\n${repoDir}\n`);
  console.log(`Daemon\n${running ? `running (pid ${pid})` : "not running"}\n`);
  if (session) {
    console.log(`Session\n${session.id}\n`);
    console.log(`Started\n${formatTime(session.started_at)}\n`);
    console.log(`Events\n${events}\n`);
    if (session.branch) console.log(`Branch\n${session.branch}\n`);
  } else {
    console.log(lastSession ? `Last session\n${lastSession.id} (${lastSession.status})` : "No sessions recorded yet");
    console.log();
  }
  console.log(`Watching\n${config.agents.claude ? "claude " : ""}${config.agents.codex ? "codex " : ""}${config.agents.opencode ? "opencode " : ""}${config.agents.gemini ? "gemini " : ""}\n`);
  console.log("All data stays local. No telemetry. No cloud.");
}

function openDb(ailogDir: string): Database {
  return new Database(path.join(ailogDir, "events.db"));
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}