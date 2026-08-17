import * as fs from "fs";
import * as path from "path";
import { requireProjectDir } from "../util";
import { Database } from "../../storage/database";
import { DB_FILE, INBOX_DIR } from "../../core/paths";

export function clearHistory(flags: Map<string, string | boolean>): void {
  const { ailogDir } = requireProjectDir();

  if (flags.get("yes") !== true) {
    process.stdout.write("Delete all recorded ai.log history? This cannot be undone. [y/N] ");
    let answer: string;
    try {
      answer = fs.readFileSync(0, { encoding: "utf8" });
    } catch {
      console.error("ai.log: could not read confirmation from stdin.");
      process.exit(1);
    }
    if (!/^y(es)?$/i.test(answer.trim())) {
      console.log("Aborted.");
      process.exit(1);
    }
  }

  const db = new Database(path.join(ailogDir, DB_FILE));
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
