import { test } from "node:test";
import assert from "node:assert/strict";
import { redactCommand } from "../dist/security/redact.js";

test("redaction is idempotent", () => {
  const once = redactCommand("gh auth login --token=ghp_1234567890abcdef");
  assert.equal(redactCommand(once), once);
});

test("redaction preserves command shape", () => {
  const out = redactCommand("sh -c 'curl -s -H \"X-Api-Key: abc123\" https://api.example.com/list?api_key=xyz --output out.json'");
  assert.doesNotMatch(out, /abc123|xyz/);
  assert.match(out, /sh -c/);
  assert.match(out, /out\.json/);
});