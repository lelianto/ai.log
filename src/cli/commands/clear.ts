import * as fs from "fs";
import * as path from "path";
import { findProjectDir, ensureAilogDir } from "../../core/project";
import { Database } from "../../storage/database";
import { INBOX_DIR } from "../../core/paths";

export function clearHistory(flags: Map<string, string | boolean>): void {
  let repoDir: string;
  try {
    repoDir = findProjectDir(process.cwd());
  } catch {
    console.error(`ai.log: no .ailog directory found in this workspace.\nRun "ai.log init" first.`);
    process.exit(1);
  }
  const ailogDir = ensureAilogDir(repoDir);

  if (flags.get("yes") !== true) {
    process.stdout.write("Delete all recorded ai.log history? This cannot be undone. [y/N] ");
    try {
      const answer = fs.readFileSync(0, { encoding: "utf8" });
      if (!/^y(es)?$/i.test(answer.trim())) {
        console.log("Aborted.");
        return;
      }
    } catch {
      return;
    }
  }

  const db = new Database(path.join(ailogDir, "events.db"));
  db.clearEvents();
  db.close();

  try {
    const inbox = path.join(ailogDir, INBOX_DIR);
    for (const f of fs.readdirSync(inbox)) {
      if (f.endsWith(".jsonl")) fs.unlinkSync(path.join(inbox, f));
    }
    const offsets = path.join(inbox, ".offsets.json");
    if (fs.existsSync(offsets)) fs.unlinkSync(offsets);
  } catch {
    // ignore
  }

  console.log("\u2713 ai.log history cleared. All data removed locally.");
}