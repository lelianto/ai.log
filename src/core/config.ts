import * as fs from "fs";
import * as path from "path";
import { CONFIG_FILE } from "./paths";

export interface AILogConfig {
  ignore: string[];
  security: {
    detectSecrets: boolean;
    detectDangerousCommands: boolean;
    detectNetworkCommands: boolean;
  };
  agents: {
    claude: boolean;
    codex: boolean;
    opencode: boolean;
    gemini: boolean;
    cursor: boolean;
    aider: boolean;
    cline: boolean;
  };
}

export const DEFAULT_IGNORE = [
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "coverage",
  ".ailog",
  ".cache",
  "tmp",
  ".venv",
  "venv",
  "__pycache__",
  ".turbo",
  ".svelte-kit",
  ".gradle",
  ".idea",
  ".vscode",
];

export const DEFAULT_CONFIG: AILogConfig = {
  ignore: DEFAULT_IGNORE,
  security: {
    detectSecrets: true,
    detectDangerousCommands: true,
    detectNetworkCommands: true,
  },
  agents: {
    claude: true,
    codex: true,
    opencode: true,
    gemini: true,
    cursor: true,
    aider: true,
    cline: true,
  },
};

function isSafeIgnoreEntry(v: unknown): v is string {
  if (typeof v !== "string" || v.length === 0 || v.length > 256) return false;
  if (v.startsWith("/") || v.includes("\\")) return false;
  const segments = v.split("/");
  return segments.every((s) => s !== ".." && s !== "." && s !== "");
}

function validateConfig(cfg: unknown): AILogConfig {
  if (cfg === null || typeof cfg !== "object" || Array.isArray(cfg)) {
    throw new Error("config.json must be a JSON object");
  }
  const c = cfg as Record<string, unknown>;
  const out: AILogConfig = structuredClone(DEFAULT_CONFIG);

  if (c.ignore !== undefined) {
    if (!Array.isArray(c.ignore)) throw new Error("config ignore must be an array of directory names");
    out.ignore = c.ignore.filter(isSafeIgnoreEntry);
  }

  if (c.security !== undefined) {
    if (c.security === null || typeof c.security !== "object") {
      throw new Error("config security must be an object");
    }
    const s = c.security as Record<string, unknown>;
    for (const key of ["detectSecrets", "detectDangerousCommands", "detectNetworkCommands"] as const) {
      if (s[key] !== undefined) {
        if (typeof s[key] !== "boolean") throw new Error(`config security.${key} must be a boolean`);
        out.security[key] = s[key] as boolean;
      }
    }
  }

  if (c.agents !== undefined) {
    if (c.agents === null || typeof c.agents !== "object") throw new Error("config agents must be an object");
    const a = c.agents as Record<string, unknown>;
    for (const key of ["claude", "codex", "opencode", "gemini", "cursor", "aider", "cline"] as const) {
      if (a[key] !== undefined) {
        if (typeof a[key] !== "boolean") throw new Error(`config agents.${key} must be a boolean`);
        out.agents[key] = a[key] as boolean;
      }
    }
  }

  return out;
}

export function loadConfig(ailogDir: string): AILogConfig {
  const file = path.join(ailogDir, CONFIG_FILE);
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${CONFIG_FILE} is not valid JSON`);
  }
  return validateConfig(parsed);
}

export function writeConfig(ailogDir: string, cfg: AILogConfig): void {
  fs.writeFileSync(path.join(ailogDir, CONFIG_FILE), JSON.stringify(cfg, null, 2) + "\n");
}

export function isIgnored(relPath: string, cfg: AILogConfig): boolean {
  if (relPath === "" || relPath.startsWith("/")) return false;
  const segments = relPath.split("/");
  for (const seg of segments) {
    if (cfg.ignore.includes(seg)) return true;
  }
  if (cfg.ignore.includes(relPath)) return true;
  return false;
}

export { isSafeIgnoreEntry };