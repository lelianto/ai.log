import * as fs from "fs";
import * as path from "path";
import { requireProjectDir, agentStatusLine, fail } from "../util";
import { loadConfig } from "../../core/config";
import { CONFIG_FILE } from "../../core/paths";
import { installAgentHooks } from "../../adapters/installer";

const AGENTS = ["claude", "codex", "gemini", "opencode", "cursor", "cline"] as const;

export function runInstall(): void {
  const { repoDir, ailogDir } = requireProjectDir();

  if (!fs.existsSync(path.join(ailogDir, CONFIG_FILE))) {
    fail(`missing ${path.join(".ailog", CONFIG_FILE)}. Run "ai.log init" first.`);
  }
  const config = loadConfig(ailogDir);

  const { installed, skipped } = installAgentHooks(repoDir, config);
  console.log("\u2713 agent hooks updated\n");
  console.log(`Agent hooks\n${agentStatusLine(installed, skipped, AGENTS)}\n`);
}
