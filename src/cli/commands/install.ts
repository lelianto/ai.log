import * as fs from "fs";
import * as path from "path";
import { loadConfig } from "../../core/config";
import { CONFIG_FILE } from "../../core/paths";
import { findProjectDir } from "../../core/project";
import { installAgentHooks } from "../../adapters/installer";

export function runInstall(): void {
  let repoDir: string;
  try {
    repoDir = findProjectDir(process.cwd());
  } catch {
    console.error(`ai.log: no .ailog directory found in this workspace.\nRun "ai.log init" first.`);
    process.exit(1);
  }

  const ailogDir = path.join(repoDir, ".ailog");
  const config = fs.existsSync(path.join(ailogDir, CONFIG_FILE)) ? loadConfig(ailogDir) : undefined;
  if (!config) {
    console.error(`ai.log: missing ${path.join(".ailog", CONFIG_FILE)}. Run "ai.log init" first.`);
    process.exit(1);
  }

  const { installed, skipped } = installAgentHooks(repoDir, config);
  console.log("\u2713 agent hooks updated\n");
  const agentLine = (a: string): string => {
    if (installed.includes(a)) return "installed";
    if (skipped.includes(a)) return "disabled";
    return "not installed";
  };
  console.log(`Agent hooks\n${["claude", "codex", "gemini", "opencode"].map((a) => `  ${a}: ${agentLine(a)}`).join("\n")}\n`);
}