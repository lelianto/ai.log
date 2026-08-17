import { execFile } from "child_process";
import { newEvent, type AILogEvent } from "../core/events";
import type { AILogConfig } from "../core/config";
import type { Actor } from "../core/constants";

const AGENT_PROCESSES: Record<string, string[]> = {
  claude: ["claude", "claude-code"],
  codex: ["codex", "codex-cli"],
  opencode: ["opencode"],
  gemini: ["gemini"],
  cursor: ["cursor", "Cursor"],
};

const POLL_MS = 3000;
const REPORT_EVERY_MS = 30000;
const MAX_ARGS_OUTPUT = 64 * 1024;

interface ProcEntry {
  pid: number;
  comm: string;
  args: string;
}

/**
 * Polls visible processes for known coding agents. This is a weak, inferred
 * signal (identity of the *process*, not proof of what it did), so emitted
 * events carry low confidence and "agent" category.
 */
export function pollProcesses(config: AILogConfig, cb: (event: AILogEvent) => void): void {
  const lastSeen: Record<string, number> = {};

  const tick = (): void => {
    execFile(
      "ps",
      ["-axo", "pid=,comm=,args="],
      { encoding: "utf8", timeout: 4000, maxBuffer: MAX_ARGS_OUTPUT },
      (err, stdout) => {
        if (err) return;
        for (const line of stdout.split("\n")) {
          const m = line.match(/^\s*(\d+)\s+(\S+)\s+(.*)$/);
          if (!m) continue;
          const entry: ProcEntry = { pid: Number.parseInt(m[1], 10), comm: m[2], args: m[3] ?? "" };
          const agent = matchAgent(entry, config);
          if (!agent) continue;
          const now = Date.now();
          const last = lastSeen[agent] ?? 0;
          if (now - last >= REPORT_EVERY_MS) {
            lastSeen[agent] = now;
            cb(
              newEvent({
                sessionId: "",
                repository: "",
                actor: agent,
                category: "agent",
                action: "active",
                source: "process",
                target: agent,
                metadata: { pid: entry.pid, inferred: true },
                confidence: 0.5,
                observed: false,
              })
            );
          } else {
            lastSeen[agent] = now;
          }
        }
      }
    );
  };

  tick();
  const timer = setInterval(tick, POLL_MS);
  timer.unref();
}

function matchAgent(entry: ProcEntry, config: AILogConfig): Actor | null {
  const lower = entry.comm.toLowerCase();
  const argsLower = entry.args.toLowerCase();
  for (const [agent, patterns] of Object.entries(AGENT_PROCESSES)) {
    if (config.agents[agent as keyof AILogConfig["agents"]] === false) continue;
    if (patterns.some((p) => lower.includes(p.toLowerCase()) || argsLower.includes(p.toLowerCase()))) {
      return agent as Actor;
    }
  }
  return null;
}