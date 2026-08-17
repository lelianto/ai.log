import { test } from "node:test";
import assert from "node:assert/strict";
import { redactCommand, hasRedaction } from "../dist/security/redact.js";

test("redacts --flag=value secrets", () => {
  const out = redactCommand("gh auth login --token=ghp_1234567890abcdef");
  assert.equal(out, "gh auth login --token=[REDACTED]");
  assert.equal(hasRedaction(out), true);
});

test("redacts --flag value secrets", () => {
  const out = redactCommand("aws s3 cp x --secret-key AKIA12345678");
  assert.match(out, /--secret-key \[REDACTED\]/);
  assert.doesNotMatch(out, /AKIA12345678/);
});

test("redacts env-style assignments", () => {
  const out = redactCommand("MY_TOKEN=abc123 export B=1 && cmd");
  assert.equal(out, "MY_TOKEN=[REDACTED] export B=1 && cmd");
});

test("redacts Authorization bearer tokens", () => {
  const out = redactCommand('curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" /api');
  assert.match(out, /Bearer \[REDACTED\]/);
  assert.doesNotMatch(out, /eyJhbGci/);
});

test("redacts secret query parameters in URLs", () => {
  const out = redactCommand("curl 'https://api.example.com/x?token=supersecret&a=1'");
  assert.match(out, /token=\[REDACTED\]/);
  assert.doesNotMatch(out, /supersecret/);
  assert.match(out, /a=1/);
});

test("does not redact benign words containing 'token'", () => {
  const out = redactCommand("python -m tokenize main.py && git config --global user.name author=Ada");
  assert.equal(out, "python -m tokenize main.py && git config --global user.name author=Ada");
});

test("does not redact plain commands", () => {
  const out = redactCommand("ls -la && npm run build");
  assert.equal(out, "ls -la && npm run build");
  assert.equal(hasRedaction(out), false);
});

test("redacts export KEY=value", () => {
  const out = redactCommand("export AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");
  assert.match(out, /AWS_SECRET_ACCESS_KEY=\[REDACTED\]/);
});