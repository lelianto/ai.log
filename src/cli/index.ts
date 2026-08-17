import { parseArgs } from "./args";
import { HELP, printVersion } from "./help";
import { runInit } from "./commands/init";
import { runIngest } from "./commands/ingest";
import { runShow } from "./commands/show";
import { runStatus } from "./commands/status";
import { runStart, runStop } from "./commands/session";
import { clearHistory } from "./commands/clear";
import { runInstall } from "./commands/install";

const KNOWN_COMMANDS = new Set(["init", "start", "stop", "status", "clear", "ingest", "install", "help", "version"]);

export function main(argv: string[]): void {
  const { command, flags } = parseArgs(argv);

  if (flags.get("version") === true || command === "version") {
    printVersion();
    return;
  }
  if (flags.get("help") === true || command === "help") {
    console.log(HELP);
    return;
  }

  if (command === null || command === "") {
    runShow(flags);
    return;
  }

  if (!KNOWN_COMMANDS.has(command)) {
    console.error(`ai.log: unknown command "${command}"\n`);
    console.error(HELP);
    process.exit(1);
  }

  switch (command) {
    case "init":
      runInit(process.cwd());
      break;
    case "start":
      runStart();
      break;
    case "stop":
      runStop();
      break;
    case "status":
      runStatus();
      break;
    case "clear":
      clearHistory(flags);
      break;
    case "ingest": {
      const agent = flags.get("agent");
      const cwd = flags.get("cwd");
      runIngest(typeof agent === "string" ? agent : undefined, typeof cwd === "string" ? cwd : undefined);
      break;
    }
    case "install":
      runInstall();
      break;
    default:
      process.exit(1);
  }
}

main(process.argv.slice(2));