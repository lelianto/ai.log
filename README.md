<div align="center">

# ai.log

### See what your AI actually did.

A local-first activity log for AI coding agents. Every file read, every command
run, every failure — recorded honestly, kept on your machine, never sent anywhere.

**Claude Code** · **Codex** · **OpenCode** · **Gemini CLI**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-339933)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/types-TypeScript%20strict-3178C6)](https://www.typescriptlang.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/lelianto/ai.log/pulls)

---

Your AI pair programmer works fast. *Do you know what it actually touched?*

**ai.log** answers that question. It watches your project while Claude Code,
Codex, OpenCode, or Gemini CLI work, and records **what happened** — files read,
files written, commands run, tests that failed, dependencies that changed, and
anything that looks dangerous. Then it shows you a calm, readable timeline.

```
$ ai.log
──────────────────────────────────────────────
Session            alog_1m2e563w1x6k0a4f54655245
Started            11:05:56
Duration           42 min
Summary            128 command, 56 filesystem, 3 test, 1 security

11:07:12  CLAUDE    WRITE   src/hooks/useAuth.ts
11:08:01  CODEX     EXECUTE npm run build
11:08:03  SYSTEM    FAIL    npm run build (exit 1)
11:08:31  CLAUDE    WRITE   src/lib/api.ts
11:09:02  CLAUDE    EXECUTE curl https://api.stripe.com/v1 --token=[REDACTED]
11:09:12  SECURITY  SENSITIVE-COMMAND   [medium]
```

**100% local. Zero telemetry. Zero cloud. Zero bullshit.**

</div>

## ✨ Highlights

- 🔍 **Sees the real thing** — reads agent hook streams (`PostToolUse`,
  `SessionStart`, …) instead of guessing from process names
- 🕵️ **Honest by design** — every event carries a `confidence` score and an
  `observed` flag. Inferred activity is never presented as fact
- 🔐 **Secrets never leak** — `--token=ghp_x`, `AWS_SECRET_ACCESS_KEY=…`,
  `?api_key=…` are redacted to `[REDACTED]` *before* they touch disk
- 🛡️ **Danger radar** — surfaces `sudo`, `rm -rf`, credential files, and network
  calls with a risk level (`low → critical`)
- 📦 **Local-first** — SQLite + JSONL in `.ailog/`, git-ignored by default
- 🧩 **Drop-in** — installs non-destructive hooks into your agents' configs;
  re-runnable, reversible, preserves your existing settings
- 📊 **Git-aware** — tracks branch/HEAD per session, watches `package.json` for
  dependency installs/updates/removals

---

## 🚀 Quick start

> Requires **Node.js ≥ 18**:

```sh
npm install -g ai.log-cli
```

Then, in any project you work on with an AI agent:

```sh
cd my-project

ai.log init     # one-time: creates .ailog/ + installs agent hooks
ai.log start    # start recording (background daemon)

# ... use Claude Code, Codex, OpenCode, or Gemini CLI as usual ...

ai.log          # see what your agents did
ai.log --security  # anything risky?
ai.log stop     # stop recording
```

That's it. `ai.log` on its own shows the current session's timeline; the
`--changes`, `--commands`, `--errors`, and `--security` flags give you focused
views.

---

## 📖 Commands

| Command | Description |
|---|---|
| `ai.log init` | Initialize ai.log in the current workspace |
| `ai.log start` | Start recording a session (background daemon) |
| `ai.log stop` | Stop recording the current session |
| `ai.log status` | Show daemon, session, and event state |
| `ai.log` | Show the latest session activity |
| `ai.log --changes` | Show file changes during the session |
| `ai.log --commands` | Show executed commands |
| `ai.log --errors` | Show failures |
| `ai.log --security` | Show potentially sensitive activity |
| `ai.log --json` | Dump raw normalized events as JSON |
| `ai.log clear` | Delete all recorded history (asks for confirmation, or `--yes`) |
| `ai.log --help` / `--version` | Help / version |

---

## 🔎 How it works

```
┌─────────────── agent hooks (observed) ───────────────┐
│  Claude Code   .claude/settings.json                  │
│  Codex         .codex/hooks.json                      │
│  Gemini CLI    .gemini/settings.json                  │
│  OpenCode      .opencode/plugin/ailog.js              │
└───────────────────────┬──────────────────────────────┘
                        │ JSONL, one line per event
                        ▼
              .ailog/inbox/<agent>.jsonl
                        │
        ┌───────────────┴────────────────┐
        │          daemon (tail)         │
        │  ┌─────────────────────────┐   │
        │  │  attribution engine     │   │
        │  │  • normalize payload    │   │
        │  │  • attach session/repo  │   │
        │  │  • redact secrets       │   │
        │  └───────────┬─────────────┘   │
        │              ▼                 │
        │  security scanner ──► derived security events
        │  dependency tracker ─► install/update/remove events
        │  failure detector ───► test pass/fail events
        │              ▼                 │
        │        SQLite (WAL)            │
        └───────────────┬────────────────┘
                        ▼
              ai.log ──► readable timeline
```

### Three signal sources

| Source | Example | Confidence |
|---|---|---|
| **Agent hooks** (observed) | Claude reports `PostToolUse: Write src/foo.ts` | `0.93 – 0.97` |
| **Filesystem watcher** (inferred) | a file changed near an agent's recent work | `0.25 – 0.85` |
| **Process poller** (inferred) | a `claude` process is running | `0.5` |

Hooks are the ground truth. The watcher and process poller only fill gaps, and
they always say so: lower confidence, `observed: false`, and an explicit
`metadata.inferred: true`.

---

## 🔐 Security model

This is the part we care about most. Your AI's commands can contain real
secrets — tokens, keys, passwords — and a naive logger would happily write them
to disk.

**ai.log doesn't.**

1. **Redact before disk.** Payloads are redacted the moment they're ingested —
   before a single byte is written to `.ailog/inbox/`. Key-based flags
   (`--token=…`), env assignments (`AWS_SECRET_ACCESS_KEY=…`), auth headers
   (`Authorization: Bearer …`), and secret URL query params (`?api_key=…`) all
   become `[REDACTED]`. The redaction is *idempotent* — re-reading an already
   redacted line changes nothing.
2. **Sanitize everything.** ANSI escapes and control characters are stripped;
   metadata and targets are size-capped.
3. **Parameterized SQL only.** No string-built queries, ever.
4. **Least privilege.** The daemon runs as your user, detached, writing only to
   the project's `.ailog/` directory. Hooks run a single append-only command
   that never blocks or alters the agent.
5. **Risk radar.** `ai.log --security` flags sensitive-file access (`.env`,
   `.ssh`, `*.pem`, credentials files), dangerous commands (`sudo`, `rm -rf`,
   `chmod`, `git reset --hard`, `DROP DATABASE`, …), and network commands
   (`curl`, `wget`, `ssh`, `scp`, `nc`, …) — each with a risk level.

> Everything stays in `.ailog/` (SQLite + JSONL), which `ai.log init` adds to
> `.gitignore` automatically. There is no cloud, no telemetry, no analytics.

---

## ⚙️ Configuration

`.ailog/config.json` is created by `ai.log init`. Everything is optional —
missing fields fall back to defaults:

```jsonc
{
  // Agents to install hooks for (on init / install)
  "agents": {
    "claude": true,
    "codex": true,
    "opencode": true,
    "gemini": true
  },
  // Paths the filesystem watcher never records
  "ignore": [
    "node_modules", ".git", "dist", "build", "coverage", ".ailog",
    ".cache", "tmp", ".venv", "venv", "__pycache__",
    ".turbo", ".svelte-kit", ".gradle", ".idea", ".vscode"
  ],
  // Security scanning toggles
  "security": {
    "detectSecrets": true,
    "detectDangerousCommands": true,
    "detectNetworkCommands": true
  }
}
```

Re-run hook installation anytime with `ai.log install` — it merges
non-destructively, so your own agent settings and custom hooks are preserved.

---

## 🧠 Design principles

- **Honesty over inference.** Observed events and inferred events are never
  conflated. If ai.log didn't *see* it, it says so.
- **Never disturb the agent.** Hooks are append-only, best-effort, silent. A
  failure in ai.log can never break your agent's workflow.
- **Local-first.** Your activity log is yours. Deleting `.ailog/` deletes
  everything — no remote copies, no sync, no analytics.
- **Defense in depth.** Redaction happens at ingest *and* at read-back;
  sanitization happens at the adapter layer *and* in the pipeline.

---

## 🛠️ Development

```sh
npm install
npm run build      # tsc (strict)
npm test           # node --test tests/
npm run typecheck  # tsc --noEmit
```

```sh
# try it in a throwaway project
mkdir /tmp/demo && cd /tmp/demo
node /path/to/ai.log/dist/cli/index.js init
node /path/to/ai.log/dist/cli/index.js start
# ... use an agent ...
node /path/to/ai.log/dist/cli/index.js
node /path/to/ai.log/dist/cli/index.js stop
```

---

## 🗺️ Roadmap

- [x] Publish to npm (`ai.log-cli`)
- [ ] `ai.log undo` — diff/revert what an agent changed
- [ ] Session replay with full command/exit timeline
- [ ] Support more agents (Aider, Cursor, Cline, …)
- [ ] `ai.log report` — daily/weekly summaries for standups
- [ ] Dependency manifests beyond `package.json` (pnpm, yarn, Go, Cargo)

---

## 🤝 Contributing

PRs are welcome! Keep the core principles in mind:

- New agents = new adapter (pure function: `payload → event | null`)
- Never block or disturb the agent loop
- Keep redaction idempotent and shape-preserving
- Tests live in `tests/` and run against `dist/`

---

<div align="center">

**ai.log** — see what your AI did.

Built with TypeScript, SQLite, and an unhealthy amount of curiosity.

[License: MIT](LICENSE)

</div>
