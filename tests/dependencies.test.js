import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGoMod, parseToml, parseJsonManifest, diffDeps } from "../dist/analysis/dependencies.js";

test("parseGoMod reads single and block requires", () => {
  const deps = parseGoMod(`module example.com/foo

go 1.21

require github.com/spf13/cobra v1.8.0

require (
\tgolang.org/x/crypto v0.24.0
\tgithub.com/stretchr/testify v1.9.0 // indirect
)
`);
  assert.equal(deps["github.com/spf13/cobra"], "v1.8.0");
  assert.equal(deps["golang.org/x/crypto"], "v0.24.0");
  assert.equal(deps["github.com/stretchr/testify"], "v1.9.0");
});

test("parseToml handles bare and inline-table dependencies", () => {
  const deps = parseToml(`[package]
name = "foo"
version = "0.1.0"

[dependencies]
serde = "1.0"
tokio = { version = "1.35", features = ["full"] }
clap = { version = "4.4", default-features = false }
`);
  assert.equal(deps.serde, "1.0");
  assert.equal(deps.tokio, "1.35");
  assert.equal(deps.clap, "4.4");
});

test("parseJsonManifest reads package.json dependency sections", () => {
  const deps = parseJsonManifest(
    JSON.stringify({ dependencies: { express: "^4.18.0" }, devDependencies: { jest: "^29.0.0" } }),
    "package.json"
  );
  assert.equal(deps.express, "^4.18.0");
  assert.equal(deps.jest, "^29.0.0");
});

test("diffDeps ignores versions that only differ in prefix ecosystem", () => {
  const prev = { "go:github.com/spf13/cobra": "v1.8.0" };
  const cur = { "go:github.com/spf13/cobra": "v1.8.0", "npm:express": "^4.18.0" };
  const changes = diffDeps(prev, cur);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].type, "install");
  assert.equal(changes[0].name, "npm:express");
});