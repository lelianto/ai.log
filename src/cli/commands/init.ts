import * as fs from "fs";
import * as path from "path";
import { DEFAULT_CONFIG, writeConfig } from "../../core/config";
import { AILOG_DIR, DB_FILE, INBOX_DIR, SESSIONS_DIR } from "../../core/paths";
import { gitRootOf } from "../../collectors/git";
import { Database } from "../../storage/database";

export function runInit(projectDir: string): void {
  const gitRoot = gitRootOf(projectDir);
  if (gitRoot) {
    projectDir = gitRoot;
  }

  const ailogDir = path.join(projectDir, AILOG_DIR);
  if (fs.existsSync(ailogDir) && fs.statSync(ailogDir).isDirectory()) {
    console.log(`\u2717 ai.log is already initialized in ${projectDir}`);
    console.log(`\n  Run: ai.log start`);
    process.exit(1);
  }

  fs.mkdirSync(path.join(ailogDir, INBOX_DIR), { recursive: true });
  fs.mkdirSync(path.join(ailogDir, SESSIONS_DIR), { recursive: true });
  writeConfig(ailogDir, DEFAULT_CONFIG);

  const gitignore = "*\n!.gitignore\n";
  fs.writeFileSync(path.join(ailogDir, ".gitignore"), gitignore);

  const db = new Database(path.join(ailogDir, DB_FILE));
  db.close();

  console.log("\u2713 ai.log initialized\n");
  console.log(`Project\n${projectDir}\n`);
  console.log(`Created\n${AILOG_DIR}/config.json\n${AILOG_DIR}/events.db\n${AILOG_DIR}/inbox/\n${AILOG_DIR}/sessions/\n`);
  if (!gitRoot) {
    console.log("Note: not a Git repository - Git-based features (ai.log --changes) need Git.\n");
  }
  console.log("Run:\n\n  ai.log start\n\nto start recording AI activity.");
}