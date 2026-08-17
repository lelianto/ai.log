#!/usr/bin/env node
import { runDaemon } from "./index";

const repoDir = process.argv[2];
if (!repoDir) {
  process.stderr.write("ai.log daemon: missing repository path\n");
  process.exit(1);
}

runDaemon(repoDir).catch((err) => {
  console.error(`[ai.log] fatal: ${String(err)}`);
  process.exit(1);
});