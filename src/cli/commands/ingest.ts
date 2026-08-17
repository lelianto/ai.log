import * as fs from "fs";
import * as path from "path";
import { findAilogDir, INBOX_DIR } from "../../core/paths";
import { isAgent } from "../../core/constants";

const MAX_INPUT_BYTES = 1024 * 1024;
const MAX_LINE_BYTES = 256 * 1024;

/**
 * `ai.log ingest` - used by agent hooks. Reads a JSON payload from stdin,
 * appends it to the spool file, and exits. Must never disturb the agent loop:
 * any failure results in a silent exit 0.
 */
export function runIngest(agent: string | undefined, cwdArg: string | undefined): void {
  if (!isAgent(agent)) process.exit(0);

  const debug = process.env.AI_LOG_DEBUG === "1";
  const dbg = (msg: string): void => {
    if (debug) process.stderr.write(`[ai.log ingest] ${msg}\n`);
  };

  let input = "";
  try {
    const buf = fs.readFileSync(0);
    if (buf.length > MAX_INPUT_BYTES) {
      dbg("input too large");
      process.exit(0);
    }
    input = buf.toString("utf8");
  } catch {
    process.exit(0);
  }
  if (!input.trim()) process.exit(0);

  let payload: unknown;
  try {
    payload = JSON.parse(input);
  } catch {
    dbg("invalid JSON");
    process.exit(0);
  }
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) process.exit(0);

  const cwd = cwdArg || (typeof (payload as Record<string, unknown>).cwd === "string" ? ((payload as Record<string, unknown>).cwd as string) : undefined) || process.cwd();
  dbg(`cwd=${cwd}`);
  const ailogDir = findAilogDir(cwd);
  if (!ailogDir) {
    dbg("no .ailog found");
    process.exit(0);
  }

  const inbox = path.join(ailogDir, INBOX_DIR);
  const file = path.join(inbox, `${agent}.jsonl`);

  let line: string;
  try {
    line = JSON.stringify({ agent, at: new Date().toISOString(), payload }) + "\n";
    if (Buffer.byteLength(line) > MAX_LINE_BYTES) {
      const truncated = JSON.stringify({ agent, at: new Date().toISOString(), payload: { truncated: true, reason: "payload too large" } });
      line = truncated + "\n";
    }
  } catch {
    process.exit(0);
  }

  try {
    fs.mkdirSync(inbox, { recursive: true });
    fs.appendFileSync(file, line, { flag: "a" });
  } catch {
    dbg("append failed");
    process.exit(0);
  }
  process.exit(0);
}