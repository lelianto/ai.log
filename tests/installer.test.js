import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { installAgentHooks } from "../dist/adapters/installer.js";

const CONFIG_ALL = { agents: { claude: true, codex: true, gemini: true, opencode: true, cursor: true, aider: true, cline: true }, ignore: [] }

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ailog-install-"));
}

test("installer writes hook configs and preserves existing user settings", () => {
  const dir = tmpProject();

  const userHook = {
    hooks: {
      SessionStart: [{ matcher: "startup|resume", hooks: [{ type: "command", command: "echo user-hook" }] }],
    },
    customKey: { keep: "me" },
  };
  fs.mkdirSync(path.join(dir, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".claude", "settings.json"), JSON.stringify(userHook));

  const { installed } = installAgentHooks(dir, CONFIG_ALL);
  assert.deepEqual(installed.sort(), ["claude", "cline", "codex", "cursor", "gemini", "opencode"]);

  const claude = JSON.parse(fs.readFileSync(path.join(dir, ".claude", "settings.json"), "utf8"));
  assert.equal(claude.customKey.keep, "me");
  assert.ok(Array.isArray(claude.hooks.PostToolUse));
  assert.ok(claude.hooks.SessionStart.some((g) => JSON.stringify(g).includes("ingest --agent claude")));
  assert.ok(claude.hooks.SessionStart.some((g) => JSON.stringify(g).includes("echo user-hook")));

  const codex = JSON.parse(fs.readFileSync(path.join(dir, ".codex", "hooks.json"), "utf8"));
  assert.ok(Array.isArray(codex.hooks.SessionStart));
  assert.ok(JSON.stringify(codex).includes("ingest --agent codex"));

  const gemini = JSON.parse(fs.readFileSync(path.join(dir, ".gemini", "settings.json"), "utf8"));
  assert.ok(Array.isArray(gemini.hooks.AfterTool));
  assert.ok(JSON.stringify(gemini).includes("ingest --agent gemini"));

  assert.ok(fs.existsSync(path.join(dir, ".opencode", "plugin", "ailog.js")));
});

test("re-running installer does not duplicate hooks", () => {
  const dir = tmpProject();
  installAgentHooks(dir, CONFIG_ALL);
  installAgentHooks(dir, CONFIG_ALL);

  const claude = JSON.parse(fs.readFileSync(path.join(dir, ".claude", "settings.json"), "utf8"));
  const commands = JSON.stringify(claude.hooks.PostToolUse);
  assert.equal(commands.split("ingest --agent claude").length - 1, 4);
});

test("disabled agents are skipped and do not create files", () => {
  const dir = tmpProject();
  const { installed, skipped } = installAgentHooks(dir, { agents: { claude: false, codex: true, gemini: false, opencode: false, cursor: false, aider: false, cline: false }, ignore: [] });
  assert.equal(installed.length, 1);
  assert.deepEqual(installed, ["codex"]);
  assert.equal(skipped.length, 5);
  assert.ok(!fs.existsSync(path.join(dir, ".claude")));
  assert.ok(!fs.existsSync(path.join(dir, ".gemini")));
  assert.ok(!fs.existsSync(path.join(dir, ".opencode")));
});