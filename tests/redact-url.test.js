import { test } from "node:test";
import assert from "node:assert/strict";
import { redactCommand, redactString, isSensitiveKeyMatch } from "../dist/security/redact.js";

test("redacts secret query parameters in URLs", () => {
  const out = redactCommand("curl 'https://api.example.com/x?token=supersecret&a=1'");
  assert.match(out, /token=\[REDACTED\]/);
  assert.doesNotMatch(out, /supersecret/);
  assert.match(out, /a=1/);
});

test("redacts sensitive query params in bare URLs (non-command)", () => {
  const out = redactString("https://api.example.com/data?api_key=abc123&id=7", false);
  assert.match(out, /api_key=\[REDACTED\]/);
  assert.doesNotMatch(out, /abc123/);
  assert.match(out, /id=7/);
});

test("leaves benign URLs untouched", () => {
  const out = redactString("https://example.com/search?q=hello&page=2", false);
  assert.equal(out, "https://example.com/search?q=hello&page=2");
});

test("does not redact words ending in pass (bypass, compass, surpass)", () => {
  const out = redactCommand("bypass=1 compass=x surpass=y && echo done");
  assert.equal(out, "bypass=1 compass=x surpass=y && echo done");
});

test("still redacts real password assignments", () => {
  const out = redactCommand("PASS=secret123 && export DB_PASSWORD=hunter2");
  assert.match(out, /PASS=\[REDACTED\]/);
  assert.match(out, /DB_PASSWORD=\[REDACTED\]/);
  assert.doesNotMatch(out, /secret123|hunter2/);
});

test("redactString is idempotent", () => {
  const once = redactCommand("curl https://x.com/?token=abc");
  const twice = redactCommand(once);
  assert.equal(once, twice);
});

test("isSensitiveKeyMatch boundary semantics", () => {
  assert.equal(isSensitiveKeyMatch("token"), true);
  assert.equal(isSensitiveKeyMatch("MY_TOKEN"), true);
  assert.equal(isSensitiveKeyMatch("api_key"), true);
  assert.equal(isSensitiveKeyMatch("bypass"), false);
  assert.equal(isSensitiveKeyMatch("compass"), false);
  assert.equal(isSensitiveKeyMatch("tokenize"), false);
});
