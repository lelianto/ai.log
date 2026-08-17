import { test } from "node:test";
import assert from "node:assert/strict";
import { diffDeps } from "../dist/analysis/dependencies.js";
import { normalizeAider } from "../dist/adapters/aider.js";
import { normalizeCursor } from "../dist/adapters/cursor.js";
import { normalizeCline } from "../dist/adapters/cline.js";

test("diffDeps detects install/remove/update", () => {
  const changes = diffDeps({ a: "1.0.0", b: "2.0.0" }, { b: "2.1.0", c: "1.0.0" });
  const byType = Object.fromEntries(changes.map((c) => [c.type, c.name]));
  assert.equal(byType.install, "c");
  assert.equal(byType.remove, "a");
  assert.equal(byType.update, "b");
});

test("aider adapter maps shell run and edits", () => {
  const shell = normalizeAider({ hook_event_name: "PostToolUse", tool_name: "run", tool_input: { command: "npm test" }, session_id: "s", cwd: "/p" });
  assert.equal(shell.category, "command");
  assert.equal(shell.target, "npm test");
  const edit = normalizeAider({ hook_event_name: "PostToolUse", tool_name: "apply_patch", file_path: "src/a.ts", session_id: "s", cwd: "/p" });
  assert.equal(edit.category, "filesystem");
  assert.equal(edit.action, "write");
});

test("cursor adapter maps Read/Bash/Write", () => {
  const read = normalizeCursor({ hook_event_name: "PostToolUse", tool_name: "Read", tool_input: { file_path: "b.ts" }, session_id: "s", cwd: "/p" });
  assert.equal(read.action, "read");
  assert.equal(read.actor, "cursor");
  const bash = normalizeCursor({ hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "ls" }, session_id: "s", cwd: "/p" });
  assert.equal(bash.category, "command");
});

test("cline adapter maps write_to_file and execute_command", () => {
  const write = normalizeCline({ hook_event_name: "PostToolUse", tool_name: "write_to_file", tool_input: { file_path: "c.ts" }, session_id: "s", cwd: "/p" });
  assert.equal(write.action, "write");
  const cmd = normalizeCline({ hook_event_name: "PostToolUse", tool_name: "execute_command", tool_input: { command: "pwd" }, session_id: "s", cwd: "/p" });
  assert.equal(cmd.category, "command");
  assert.equal(cmd.actor, "cline");
});