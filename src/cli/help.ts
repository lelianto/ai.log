// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version: VERSION } = require("../../package.json") as { version: string };

export const HELP = `ai.log - see what your AI did.

A local-first activity log for AI coding agents.

Usage:
  ai.log init                Initialize ai.log in the current workspace
  ai.log start               Start recording a session (background daemon)
  ai.log stop                Stop recording the current session
  ai.log status              Show daemon and session state
  ai.log                     Show the latest session activity
  ai.log --changes           Show file changes during the session
  ai.log --commands          Show executed commands
  ai.log --errors            Show failures
  ai.log --security          Show potentially sensitive activity
  ai.log --json              Output raw normalized events as JSON
  ai.log replay              Full chronological session timeline (exit codes)
  ai.log report              Daily/weekly activity summary
  ai.log undo                Revert what an agent changed in a session
  ai.log clear               Delete all recorded history
  ai.log install             Re-install agent hooks
  ai.log --help              Show this help
  ai.log --version           Show version

Options:
  --session <id>             Target a specific session
  --limit <n>                Cap the number of events
  --period <daily|weekly>    Report period
  --yes                      Skip confirmation prompts

Examples:
  cd my-project
  ai.log init
  ai.log start
  # ... use Claude Code, Codex, OpenCode, Gemini CLI, Cursor, Aider, Cline ...
  ai.log
  ai.log replay
  ai.log report --period weekly
  ai.log undo
`;

export function printVersion(): void {
  console.log(`ai.log ${VERSION}`);
}