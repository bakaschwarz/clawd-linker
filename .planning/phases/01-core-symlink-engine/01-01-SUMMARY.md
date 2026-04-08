---
phase: 01-core-symlink-engine
plan: "01"
subsystem: scaffold
tags: [npm, esm, fs, config, setup]
dependency_graph:
  requires: []
  provides: [package.json, src/utils/fs.js, src/config.js, bin/clawd-linker.js]
  affects: [all future plans in phase 01]
tech_stack:
  added:
    - commander@^14.0.3
    - "@inquirer/prompts@^8.4.1"
    - conf@^15.1.0
    - simple-git@^3.35.2
    - chalk@^5.6.2
    - vitest@^4.1.3 (dev)
  patterns:
    - ESM module format (type: module)
    - Single fs boundary (src/utils/fs.js only imports from fs/promises)
    - Atomic write pattern for config (write .tmp then rename)
key_files:
  created:
    - package.json
    - package-lock.json
    - bin/clawd-linker.js
    - src/utils/fs.js
    - src/config.js
  modified: []
decisions:
  - "Use plain fs + atomic write for ~/.clawd-linker instead of conf library (conf routes to ~/Library/Preferences/ on macOS, not ~/.clawd-linker)"
  - "Validate repoPath is a string (not just truthy) to address T-01-01 tampering threat"
metrics:
  duration_seconds: 121
  completed_date: "2026-04-08"
  tasks_completed: 3
  tasks_total: 3
  files_created: 5
  files_modified: 0
---

# Phase 01 Plan 01: Project Scaffold Summary

**One-liner:** ESM npm package scaffold with fs/promises boundary module and atomic JSON config at ~/.clawd-linker.

## What Was Built

Three tasks completed in sequence to establish the foundation for all subsequent plans:

1. **npm package initialization** — package.json with `"type": "module"`, bin entry, Node >=20.12.0 engine requirement. Five runtime dependencies installed (commander, @inquirer/prompts, conf, simple-git, chalk) plus vitest as dev dependency. Stub bin file with shebang created and made executable.

2. **fs utility boundary module** (`src/utils/fs.js`) — The single file in the project that imports from `fs/promises`. Re-exports 10 fs functions and adds `walkFiles()` which recursively walks a directory returning relative paths of regular files only (skipping directories and symlinks). Uses `e.path` (not `e.parentPath`) for Node 20.12.0 compatibility.

3. **Global config module** (`src/config.js`) — Reads and writes `~/.clawd-linker` as JSON. Uses atomic write pattern (write to `.tmp` then rename) to prevent corruption on crash. Validates that repoPath exists in config, is a string type, and that the path exists on disk — exiting with colored error messages on any failure.

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Do NOT use `conf` library for `~/.clawd-linker` | Research Pitfall 8: `conf` stores to `~/Library/Preferences/` on macOS by default, not `~/.clawd-linker`. Plain fs + atomic write achieves the same result with the correct path. |
| Validate `repoPath` is a string (not just truthy) | Addresses T-01-01 (Tampering) from the threat model — a malicious config with `repoPath: true` would pass a simple truthy check but fail the `typeof` check. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Security] Added string type validation for repoPath**
- **Found during:** Task 3
- **Issue:** The plan's `getRepoPath()` only checked `!raw.repoPath`, which would pass for non-string truthy values. The threat model (T-01-01) requires validating the JSON shape.
- **Fix:** Added `typeof raw.repoPath !== 'string'` to the condition.
- **Files modified:** src/config.js
- **Commit:** 0317fd6

## Known Stubs

| File | Description |
|------|-------------|
| bin/clawd-linker.js | Stub entry point — outputs message; commands wired in Plan 03 |

This stub is intentional per the plan. Plan 03 will wire all CLI commands.

## Threat Surface Scan

All files created are within the planned threat model. No new network endpoints, auth paths, or trust boundaries introduced beyond what the threat register covers.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| package.json | FOUND |
| bin/clawd-linker.js | FOUND |
| src/utils/fs.js | FOUND |
| src/config.js | FOUND |
| Task 1 commit 11924ff | FOUND |
| Task 2 commit 4d43cb0 | FOUND |
| Task 3 commit 0317fd6 | FOUND |
