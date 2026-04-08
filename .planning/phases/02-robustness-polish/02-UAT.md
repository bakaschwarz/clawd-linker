---
status: complete
phase: 02-robustness-polish
source: [02-01-SUMMARY.md, 02-02-SUMMARY.md]
started: 2026-04-08T00:00:00Z
updated: 2026-04-08T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Dry-run Preview
expected: Run `npx clawd-linker manage --dry-run` in a project. No symlinks are created/deleted, no data.json changes. Chalk-colored preview messages show what WOULD happen. The "Proceed?" confirm prompt is skipped.
result: pass

### 2. Headless / --yes Guard
expected: Run `npx clawd-linker manage --yes` (or pipe stdin: `echo "" | npx clawd-linker manage`). The command prints an informational message and exits immediately — no checkbox TUI appears, no changes are made.
result: pass

### 3. Empty Directory Cleanup
expected: Install a package that creates files in a subdirectory (e.g., `some-dir/file.txt`). Then uninstall that package. After uninstall, the `some-dir/` directory (now empty) is automatically removed. Non-empty directories are left intact.
result: pass

### 4. Stale State Reconciliation
expected: Manually delete a symlink that clawd-linker installed (simulating stale state). Run `npx clawd-linker manage`. The TUI should NOT show that file as installed — the stale entry has been pruned from data.json before the TUI loads.
result: pass

### 5. List Command
expected: Run `npx clawd-linker list` (or `npx clawd-linker ls`) in a project with packages installed. A non-interactive list of installed packages is printed. No TUI, no prompts.
result: pass

### 6. Schema Version Warning
expected: Edit `~/.clawd-linker` (flat config file) to set `schemaVersion: 99`. Run any clawd-linker command. A warning is printed (console.warn) mentioning the unexpected schema version, but the command continues and does not crash.
result: pass
note: "Config resides at ~/.clawd-linker (flat file), not ~/.clawd-linker/config.json — test description corrected."

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
