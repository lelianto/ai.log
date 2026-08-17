export interface ParsedArgs {
  command: string | null;
  flags: Map<string, string | boolean>;
  positionals: string[];
}

export const FLAG_DEFAULTS: Record<string, "boolean" | "string"> = {
  changes: "boolean",
  commands: "boolean",
  errors: "boolean",
  security: "boolean",
  json: "boolean",
  yes: "boolean",
  help: "boolean",
  version: "boolean",
  agent: "string",
  cwd: "string",
  limit: "string",
  session: "string",
  period: "string",
};

export function parseArgs(argv: string[]): ParsedArgs {
  const flags = new Map<string, string | boolean>();
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq !== -1) {
        flags.set(arg.slice(2, eq), arg.slice(eq + 1));
        continue;
      }
      const name = arg.slice(2);
      const kind = FLAG_DEFAULTS[name] ?? "boolean";
      if (kind === "string") {
        const value = argv[i + 1];
        if (value === undefined || value.startsWith("--")) {
          console.error(`ai.log: flag --${name} requires a value`);
          process.exit(1);
        }
        flags.set(name, value);
        i += 1;
      } else {
        flags.set(name, true);
      }
      continue;
    }
    positionals.push(arg);
  }

  const command = positionals[0] ?? null;
  return { command, flags, positionals };
}
