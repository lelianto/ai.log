import { requireProjectDir, openDb, formatTime } from "../util";
import { readDaemonPid, isPidAlive } from "../../daemon/state";
import { loadConfig } from "../../core/config";

export function runStatus(): void {
  const { repoDir, ailogDir } = requireProjectDir();

  const pid = readDaemonPid(ailogDir);
  const running = pid !== null && isPidAlive(pid);

  const db = openDb(ailogDir);
  let session;
  let lastSession;
  let events = 0;
  try {
    session = db.getActiveSession(repoDir);
    lastSession = db.getLatestSession(repoDir);
    events = session ? db.countEvents(session.id) : 0;
  } finally {
    db.close();
  }

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
  const watching = (["claude", "codex", "opencode", "gemini"] as const)
    .filter((a) => config.agents[a])
    .join(" ");
  console.log(`Watching\n${watching}\n`);
  console.log("All data stays local. No telemetry. No cloud.");
}
