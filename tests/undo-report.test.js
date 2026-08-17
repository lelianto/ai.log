import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { baselineHeadOf, planUndo } from "../dist/cli/commands/undo.js";
import { periodStart } from "../dist/cli/commands/report.js";

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ailog-undo-unit-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "t@t"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
  return dir;
}

test("baselineHeadOf prefers meta.baselineHead over head", () => {
  assert.equal(baselineHeadOf({ meta: '{"baselineHead":"abc123"}', head: "def456" }), "abc123");
  assert.equal(baselineHeadOf({ meta: null, head: "def456" }), "def456");
  assert.equal(baselineHeadOf({ meta: "not-json", head: "def456" }), "def456");
  assert.equal(baselineHeadOf({ meta: "{}", head: null }), null);
});

test("report periodStart validates daily/weekly/all", () => {
  assert.ok(typeof periodStart("daily") === "string");
  assert.ok(typeof periodStart("weekly") === "string");
  assert.equal(periodStart("all"), null);
  assert.equal(typeof periodStart("bogus"), "symbol");
});

test("undo restore point resolves to git baseline commit", () => {
  const dir = tmpRepo();
  fs.writeFileSync(path.join(dir, "f.txt"), "v1");
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["commit", "-q", "-m", "baseline"], { cwd: dir });
  const baseline = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();

  fs.writeFileSync(path.join(dir, "f.txt"), "v2");
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["commit", "-q", "-m", "work"], { cwd: dir });
  const work = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
  assert.notEqual(baseline, work);

  const plan = planUndo(dir, baseline, ["f.txt"]);
  assert.deepEqual(plan.modified, ["f.txt"]);
});