import * as fs from "fs";
import * as path from "path";
import { Database } from "../storage/database";
import { EventPipeline } from "../core/pipeline";
import { loadConfig } from "../core/config";
import { startSession, stopSession } from "../core/sessions";
import { newEvent, type AILogEvent } from "../core/events";
import { watchRepo } from "./watcher";
import { tailInbox } from "./inbox";
import { pollProcesses } from "./process";
import { AttributionEngine } from "./attribution";
import { SecurityScanner } from "../security/scanner";
import { DependencyTracker } from "../analysis/dependencies";
import { FailureDetector } from "../analysis/failures";
import { writeDaemonPid, removeDaemonPid } from "./state";
import { AILOG_DIR, DB_FILE, INBOX_DIR } from "../core/paths";
import { gitBranch, gitHead } from "../collectors/git";

const HEAD_POLL_MS = 3000;

export async function runDaemon(repoDir: string): Promise<void> {
  const ailogDir = path.join(repoDir, AILOG_DIR);
  if (!fs.existsSync(ailogDir)) {
    process.stderr.write(`ai.log: not initialized in ${repoDir}\n`);
    process.exit(1);
  }

  const config = loadConfig(ailogDir);
  const db = new Database(path.join(ailogDir, DB_FILE));
  const pipeline = new EventPipeline(db);
  const attribution = new AttributionEngine();
  const security = new SecurityScanner(config);
  const dependencies = new DependencyTracker(db);
  const failures = new FailureDetector();

  const session = startSession(db, repoDir);
  writeDaemonPid(ailogDir, process.pid);
  console.error(`[ai.log] session ${session.session.id} started (pid ${process.pid})`);

  pipeline.ingest(
    newEvent({
      sessionId: session.session.id,
      repository: repoDir,
      actor: "system",
      category: "agent",
      action: "session-start",
      source: "unknown",
      confidence: 1,
      observed: true,
    })
  );

  dependencies.snapshot(session.session.id, repoDir);

  const shutdown = (): void => {
    console.error(`[ai.log] stopping session ${session.session.id}`);
    pipeline.stop();
    try {
      stopSession(db, session.session.id);
    } catch (err) {
      console.error(`[ai.log] stop error: ${String(err)}`);
    }
    db.close();
    removeDaemonPid(ailogDir);
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  process.on("uncaughtException", (err) => console.error(`[ai.log] uncaught: ${String(err)}`));
  process.on("unhandledRejection", (err) => console.error(`[ai.log] unhandled: ${String(err)}`));

  const emit = (event: AILogEvent): void => {
    pipeline.ingest(event);
    for (const derived of security.scan(event)) pipeline.ingest(derived);
    for (const derived of dependencies.onEvent(event)) pipeline.ingest(derived);
    for (const derived of failures.onEvent(event)) pipeline.ingest(derived);
  };

  const attach = (event: AILogEvent): void => {
    const e = attribution.attach(event, session.session.id, repoDir);
    emit(e);
  };

  fs.mkdirSync(path.join(ailogDir, INBOX_DIR), { recursive: true });

  watchRepo(repoDir, config, (fsEvent) => attach(fsEvent));
  tailInbox(ailogDir, (payload) => {
    const e = attribution.fromHookPayload(payload, session.session.id, repoDir);
    if (e) emit(e);
  });
  pollProcesses(config, (procEvent) => attach(procEvent));

  pipeline.start();

  setInterval(() => {
    try {
      const head = gitHead(repoDir);
      const branch = gitBranch(repoDir);
      db.updateSessionHead(session.session.id, head, branch);
    } catch {
      // ignore
    }
  }, HEAD_POLL_MS).unref();

  console.error(`[ai.log] watching ${repoDir}`);
}