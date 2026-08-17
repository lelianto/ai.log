import * as fs from "fs";
import * as path from "path";
import type { AILogConfig } from "../core/config";
import type { Agent } from "../core/constants";

interface HookGroup {
  matcher?: string;
  hooks: { type: "command"; command: string }[];
}

/**
 * Installs command hooks into agent settings files so tools report what they
 * did directly (the only reliable source of attribution). Every merge is
 * non-destructive: existing settings and user hooks are preserved.
 */

function binCommand(): string {
  const node = process.execPath;
  const cli = path.join(__dirname, "..", "cli", "index.js");
  return `${JSON.stringify(node)} ${JSON.stringify(cli)} ingest`;
}

function ingestCommand(agent: Agent): string {
  return `${binCommand()} --agent ${agent}`;
}

export function installAgentHooks(projectDir: string, config: AILogConfig): { installed: string[]; skipped: string[] } {
  const installed: string[] = [];
  const skipped: string[] = [];
  const attempt = (agent: Agent, install: () => void): void => {
    try {
      if (config.agents[agent]) {
        install();
        installed.push(agent);
      } else {
        skipped.push(agent);
      }
    } catch {
      skipped.push(agent);
    }
  };

  attempt("claude", () => installClaude(projectDir));
  attempt("codex", () => installCodex(projectDir));
  attempt("gemini", () => installGemini(projectDir));
  attempt("opencode", () => writeOpenCodePlugin(projectDir));
  attempt("cursor", () => installCursor(projectDir));
  attempt("cline", () => installCline(projectDir));

  return { installed, skipped };
}

function installClaude(projectDir: string): boolean {
  const dir = path.join(projectDir, ".claude");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "settings.json");
  const settings = readJson(file, {});

  const groups: Record<string, HookGroup[]> = {
    SessionStart: [{ matcher: "startup|resume", hooks: [{ type: "command", command: ingestCommand("claude") }] }],
    PostToolUse: [
      { matcher: "Read", hooks: [{ type: "command", command: ingestCommand("claude") }] },
      { matcher: "Write|Edit|MultiEdit|NotebookEdit", hooks: [{ type: "command", command: ingestCommand("claude") }] },
      { matcher: "Bash", hooks: [{ type: "command", command: ingestCommand("claude") }] },
      { matcher: "WebFetch|WebSearch", hooks: [{ type: "command", command: ingestCommand("claude") }] },
    ],
    PostToolUseFailure: [{ matcher: "Bash|Write|Edit|Read|MultiEdit|NotebookEdit", hooks: [{ type: "command", command: ingestCommand("claude") }] }],
    SessionEnd: [{ matcher: "*", hooks: [{ type: "command", command: ingestCommand("claude") }] }],
  };

  mergeHooks(settings, groups);
  writeJson(file, settings);
  return true;
}

function installCodex(projectDir: string): boolean {
  const dir = path.join(projectDir, ".codex");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "hooks.json");
  const settings = readJson(file, {});

  const groups: Record<string, HookGroup[]> = {
    SessionStart: [{ matcher: "startup|resume", hooks: [{ type: "command", command: ingestCommand("codex") }] }],
    PostToolUse: [
      { matcher: "^Bash$|^shell$", hooks: [{ type: "command", command: ingestCommand("codex") }] },
      { matcher: "^apply_patch$", hooks: [{ type: "command", command: ingestCommand("codex") }] },
      { matcher: "^Read$|^Write$", hooks: [{ type: "command", command: ingestCommand("codex") }] },
    ],
    SessionEnd: [{ matcher: "other", hooks: [{ type: "command", command: ingestCommand("codex") }] }],
  };

  mergeHooks(settings, groups);
  writeJson(file, settings);
  return true;
}

function installGemini(projectDir: string): boolean {
  const dir = path.join(projectDir, ".gemini");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "settings.json");
  const settings = readJson(file, {});

  const groups: Record<string, HookGroup[]> = {
    SessionStart: [{ hooks: [{ type: "command", command: ingestCommand("gemini") }] }],
    AfterTool: [{ matcher: "*", hooks: [{ type: "command", command: ingestCommand("gemini") }] }],
    SessionEnd: [{ hooks: [{ type: "command", command: ingestCommand("gemini") }] }],
  };

  mergeHooks(settings, groups);
  writeJson(file, settings);
  return true;
}

function installCursor(projectDir: string): boolean {
  const dir = path.join(projectDir, ".cursor");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "settings.json");
  const settings = readJson(file, {});

  const groups: Record<string, HookGroup[]> = {
    SessionStart: [{ matcher: "startup|resume", hooks: [{ type: "command", command: ingestCommand("cursor") }] }],
    PostToolUse: [
      { matcher: "Read", hooks: [{ type: "command", command: ingestCommand("cursor") }] },
      { matcher: "Write|Edit|MultiEdit", hooks: [{ type: "command", command: ingestCommand("cursor") }] },
      { matcher: "Bash", hooks: [{ type: "command", command: ingestCommand("cursor") }] },
    ],
    SessionEnd: [{ matcher: "*", hooks: [{ type: "command", command: ingestCommand("cursor") }] }],
  };

  mergeHooks(settings, groups);
  writeJson(file, settings);
  return true;
}

function installCline(projectDir: string): boolean {
  const dir = path.join(projectDir, ".cline");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "settings.json");
  const settings = readJson(file, {});

  const groups: Record<string, HookGroup[]> = {
    SessionStart: [{ hooks: [{ type: "command", command: ingestCommand("cline") }] }],
    AfterTool: [{ matcher: "*", hooks: [{ type: "command", command: ingestCommand("cline") }] }],
    SessionEnd: [{ hooks: [{ type: "command", command: ingestCommand("cline") }] }],
  };

  mergeHooks(settings, groups);
  writeJson(file, settings);
  return true;
}

function mergeHooks(settings: Record<string, unknown>, groups: Record<string, HookGroup[]>): void {
  const hooks = (settings.hooks ?? {}) as Record<string, unknown>;
  for (const [event, groupList] of Object.entries(groups)) {
    const existing = Array.isArray(hooks[event]) ? (hooks[event] as HookGroup[]) : [];
    for (const group of groupList) {
      const command = group.hooks[0]?.command;
      const found = (existing as HookGroup[]).some(
        (g) => Array.isArray(g.hooks) && g.hooks.some((h) => h.type === "command" && h.command === command) && (g.matcher ?? "") === (group.matcher ?? "")
      );
      if (!found) existing.push(group);
    }
    hooks[event] = existing;
  }
  settings.hooks = hooks;
}

function readJson(file: string, fallback: unknown): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // fall through
  }
  return fallback as Record<string, unknown>;
}

function writeJson(file: string, value: unknown): void {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}

function writeOpenCodePlugin(projectDir: string): void {
  const dir = path.join(projectDir, ".opencode", "plugin");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "ailog.js");
  const plugin = `import { appendFile, mkdir } from "node:fs/promises";
import * as path from "node:path";

// ai.log: forwards OpenCode events to the local activity log.
// Best effort: failures are ignored so this never disturbs the agent.
export const Ailog = async (ctx) => ({
  event: async ({ event }) => {
    try {
      const inbox = path.join(ctx.directory, ".ailog", "inbox");
      await mkdir(inbox, { recursive: true });
      const props = event.properties ?? {};
      const payload = {
        session_id: props.sessionID ?? props.id,
        event_type: event.type,
        tool: props.tool ?? props.toolName,
        args: props.args ?? props.input ?? props,
        filePath: props.filePath ?? props.file,
        command: props.command,
        cwd: ctx.directory,
      };
      const line = JSON.stringify({ agent: "opencode", at: new Date().toISOString(), payload }) + "\\n";
      await appendFile(path.join(inbox, "opencode.jsonl"), line);
    } catch {}
  },
});
`;
  fs.writeFileSync(file, plugin);
}