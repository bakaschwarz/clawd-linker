---
phase: 01-core-symlink-engine
plan: 03
subsystem: cli-commands
tags: [cli, commander, inquirer, commands, init, new, manage]
dependency_graph:
  requires: ["01-01", "01-02"]
  provides: ["cli-entry-point", "init-command", "new-command", "manage-command"]
  affects: ["bin/clawd-linker.js"]
tech_stack:
  added: ["commander routing via program.parse()", "simpleGit.init() for repo creation", "@inquirer/prompts checkbox+confirm+input"]
  patterns: ["thin orchestrator commands", "pre-check installed state before TUI", "diff-driven install/uninstall"]
key_files:
  created:
    - src/commands/init.js
    - src/commands/new.js
    - src/commands/manage.js
  modified:
    - bin/clawd-linker.js
decisions:
  - "new.js imports access directly from utils/fs.js (not dynamic import) for package-exists check"
  - "manage.js uses path.resolve(process.cwd()) for projectPath to canonicalize symlink target roots"
  - "conflictCallback passes relative path to user for readability, backs up originals with .clawd-backup suffix"
metrics:
  duration: "164s"
  completed: "2026-04-08"
  tasks: 2
  files_changed: 4
---

# Phase 1 Plan 03: CLI Commands and Entry Point Summary

**One-liner:** Commander-wired CLI entry point with init (git-initialized repo via simple-git), new (package scaffold with .gitignore), and manage (checkbox TUI driving install/uninstall diff via inquirer).

## What Was Built

Three command modules that act as thin orchestrators over the services from Plan 02, plus a fully-wired commander CLI entry point.

**src/commands/init.js** (INIT-01, INIT-02)
- Reads `~/.clawd-linker` before prompting — warns and exits if valid config already exists (INIT-02)
- Uses `@inquirer/prompts` `input` to ask for repo path with default `~/clawd-packages`
- Applies `path.resolve()` on user input (Pitfall 2 prevention)
- Creates directory with `mkdir({ recursive: true })` and calls `simpleGit(resolved).init()`
- Calls `setRepoPath(resolved)` for atomic config write

**src/commands/new.js** (PKG-01, PKG-02)
- Calls `getRepoPath()` — exits with error if not configured
- Checks if package directory already exists, exits with error if so
- Creates `files/` subdirectory, `PACKAGE.md`, `data.json` (with `{ schemaVersion: 1, installedIn: {} }`), and `.gitignore` (containing `data.json`)
- All writes go through `../utils/fs.js` — no direct `fs/promises` imports

**src/commands/manage.js** (MGR-01, MGR-02, MGR-03, LINK-05)
- Calls `getInstalledPackages` to determine pre-checked state (MGR-02)
- Shows `@inquirer/prompts` `checkbox` with `checked: installed.has(pkg.name)` (MGR-01)
- Computes `toInstall` and `toUninstall` as diff of selected vs current (MGR-03)
- Returns early "No changes needed" when diff is empty (STATE-03)
- Shows summary, prompts confirm before applying changes
- `conflictCallback` uses `inquirerConfirm` per-conflict, backs up originals with `.clawd-backup` suffix (LINK-05)

**bin/clawd-linker.js** — Replaced stub with full commander wiring:
- Registers `init`, `new <name>`, `manage` (with `.alias('m')`) subcommands
- Imports all three command modules
- Calls `program.parse()`

## Verification Results

- `node bin/clawd-linker.js --help` — shows all three commands, exits 0
- `node bin/clawd-linker.js --version` — outputs `0.1.0`
- All three command modules importable without errors

## Commits

| Task | Description | Hash |
|------|-------------|------|
| 1 | init and new commands | 2ec3506 |
| 2 | manage command + wired CLI entry point | 3bf024c |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] new.js: imported access at module level instead of dynamic import**

- **Found during:** Task 1 implementation
- **Issue:** The plan's code sample used `await import('../utils/fs.js')` inside the try block to get `access`. This is an antipattern — dynamic imports for a module already statically imported cause redundant module loading and complicate static analysis.
- **Fix:** Added `access` to the top-level static import from `'../utils/fs.js'` — same as how all other functions are imported throughout the codebase.
- **Files modified:** src/commands/new.js
- **Commit:** 2ec3506

## Known Stubs

None. All data flows are wired: commands call services which read/write real filesystem state.

## Threat Flags

No new threat surface introduced beyond what was modeled in the plan's threat register.

## Self-Check: PASSED

- [x] src/commands/init.js exists
- [x] src/commands/new.js exists
- [x] src/commands/manage.js exists
- [x] bin/clawd-linker.js updated (no longer stub)
- [x] Commit 2ec3506 exists
- [x] Commit 3bf024c exists
