#!/usr/bin/env node
import { runDaemon } from "./index";

const repoDir = process.argv[2];
if (!repoDir) {
  process.stderr.write("ai.log daemon: missing repository path\n");
  process.exit(1);
}

console.error(`[ai.log] daemon starting (cwd ${process.cwd()})`);

runDaemon(repoDir).catch((err) => {
  console.error(`[ai.log] fatal: ${String(err)}`);
  process.exit(1);
});