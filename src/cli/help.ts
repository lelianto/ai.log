const VERSION = "0.1.0";

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
  ai.log clear               Delete all recorded history
  ai.log --help              Show this help
  ai.log --version           Show version

Examples:
  cd my-project
  ai.log init
  ai.log start
  # ... use Claude Code, Codex, OpenCode, Gemini CLI ...
  ai.log
`;

export function printVersion(): void {
  console.log(`ai.log ${VERSION}`);
}