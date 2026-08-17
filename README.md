# ai.log

A local-first activity log for AI coding agents.

ai.log records what Claude Code, Codex, OpenCode, and Gemini CLI did in your
project - files read, files written, commands run, failures, dependency
changes, and potentially dangerous activity - then lets you review it.

All data lives on your machine. There is no cloud, no telemetry, no analytics.

## Install

Requires Node.js >= 18. Not yet published; link it locally:

```sh
npm install -g .
```

## Quick start

```sh
cd my-project

ai.log init     # create .ailog/, install agent hooks
ai.log start    # start recording (background daemon)
# ... work with Claude Code / Codex / OpenCode / Gemini CLI...
ai.log          # see what your agents did
ai.log stop     # stop recording
```

`ai.log init` installs trustless hooks into the project (`.claude/settings.json`,
`.codex/hooks.json`, `.gemini/settings.json`, `.opencode/plugin/ailog.js`).
These hooks run a single command that appends a JSON line to
`.ailog/inbox/<agent>.jsonl`. The hooks never leak data, never block or alter
the agent, and never send anything anywhere. Re-run later with `ai.log install`.

## Commands

```
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
ai.log --help              Show help
ai.log --version           Show version
```

## How it works

- Agent hooks (observed) report `SessionStart`, `PostToolUse`, `PostToolUseFailure`,
  and `SessionEnd` events into `.ailog/inbox/`. A daemon tails those streams and
  stores them in SQLite (`.ailog/events.db`, WAL mode).
- A filesystem watcher (inferred) and a process watcher (inferred) supplement
  hook data, with lower confidence and `observed: false`.
- Every recorded event carries `confidence` and `observed`. Inferred activity
  is never presented as fact. Raw event JSON is available with `ai.log --json`.
- Truncated paths are relative to the project root.

## Security model

- All data is local (SQLite + JSONL in `.ailog/`). `.ailog/` is git-ignored by
  default.
- Event metadata is sanitized (ANSI/control characters stripped, secrets in
  commands redacted as `[REDACTED]`) before storage.
- Queries use parameterized SQL only. Config and inbox payloads are validated
  strictly before use.
- The daemon runs as your user, detached, writing only to the project's
  `.ailog/` directory. Hooks run a single append-only command.
- `ai.log --security` surfaces sensitive-file access, dangerous commands
  (`sudo`, `rm -rf`, credential files, ...) and network commands.

## Configuration

`.ailog/config.json`:

```jsonc
{
  "agents": {
    "claude": true,   // install Claude Code hooks on init/install
    "codex": true,
    "gemini": true,
    "opencode": true
  },
  "ignore": [         // paths never recorded by the filesystem watcher
    "node_modules",
    ".git",
    "dist",
    ".ailog"
  ]
}
```

## Releasing

```sh
npm run build
npm test
npm pack
```

License: MIT