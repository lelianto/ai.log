import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeClaude } from "../dist/adapters/claude.js";
import { normalizeGemini } from "../dist/adapters/gemini.js";
import { sanitizeString } from "../dist/core/events.js";

const BASE = { session_id: "s1", cwd: "/proj", timestamp: "2026-08-17T00:00:00.000Z" };

test("claude SessionStart is observed with confidence 0.97", () => {
  const e = normalizeClaude({ hook_event_name: "SessionStart", ...BASE });
  assert.equal(e.actor, "claude");
  assert.equal(e.category, "agent");
  assert.equal(e.action, "session-start");
  assert.equal(e.observed, true);
  assert.equal(e.confidence, 0.97);
});

test("claude Bash failure carries exit code", () => {
  const e = normalizeClaude({
    hook_event_name: "PostToolUseFailure",
    ...BASE,
    tool_name: "Bash",
    tool_input: { command: "ls /missing" },
    tool_response: { exit_code: 2 },
  });
  assert.equal(e.category, "command");
  assert.equal(e.action, "fail");
  assert.equal(e.metadata.exitCode, 2);
});

test("claude Read targets are sanitized and relativized later", () => {
  const e = normalizeClaude({ hook_event_name: "PostToolUse", ...BASE, tool_name: "Read", tool_input: { file_path: "\u001b[31m/etc/passwd\u001b[0m" } });
  assert.equal(e.category, "filesystem");
  assert.equal(e.action, "read");
  assert.equal(e.target, "/etc/passwd");
});

test("claude Bash command is redacted", () => {
  const e = normalizeClaude({
    hook_event_name: "PostToolUse",
    ...BASE,
    tool_name: "Bash",
    tool_input: { command: "curl -H \"Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9\" /api" },
  });
  assert.doesNotMatch(e.target, /eyJ0eXAi/);
  assert.match(e.target, /Bearer \[REDACTED\]/);
});

test("unknown claude tools fall through to filesystem access or null", () => {
  const e = normalizeClaude({ hook_event_name: "PostToolUse", ...BASE, tool_name: "SomeTool", tool_input: { file_path: "a.txt" } });
  assert.equal(e.action, "access");
  const none = normalizeClaude({ hook_event_name: "PostToolUse", ...BASE, tool_name: "SomeTool", tool_input: {} });
  assert.equal(none, null);
});

test("gemini AfterTool maps shell to command", () => {
  const e = normalizeGemini({ hook_event_name: "AfterTool", ...BASE, tool: "code_execution", tool_input: { command: "npm test" } });
  assert.equal(e.category, "command");
  assert.equal(e.target, "npm test");
});

test("sanitizeString strips ANSI escapes and bell, keeps tabs", () => {
  assert.equal(sanitizeString("\u001b[31mred\u001b[0m \u0007"), "red ");
  assert.equal(sanitizeString("keep\ttab"), "keep\ttab");
});