---
phase: 02-robustness-polish
plan: "02"
subsystem: package-state, list-command, cli
tags: [reconcile, stale-state, list-command, schema-version, robustness]
dependency_graph:
  requires: ["02-01"]
  provides: [stale-state-reconciliation, list-command, schema-version-guards]
  affects: [src/services/package-state.js, src/commands/manage.js, src/commands/list.js, bin/clawd-linker.js, src/config.js]
tech_stack:
  added: []
  patterns: [reconcile-before-tui, forward-compat-version-warning, non-interactive-list-command]
key_files:
  created:
    - src/commands/list.js
  modified:
    - src/services/package-state.js
    - src/commands/manage.js
    - bin/clawd-linker.js
    - src/config.js
decisions:
  - "reconcileLinks recomputes expectedSource from pkg.filesPath at runtime — no paths stored in data.json (Pitfall 1)"
  - "reconcileLinks only calls writeState when changed === true (Pitfall 5 — no unnecessary writes)"
  - "Schema version guards are advisory warnings only (console.warn), not errors — UX-03 groundwork not a security boundary"
  - "list command uses getInstalledPackages (reads data.json) as source of truth, consistent with manage"
metrics:
  duration_minutes: 6
  completed_date: "2026-04-08"
  tasks_completed: 2
  files_modified: 5
---

# Phase 02 Plan 02: Stale State Reconciliation, List Command, and Schema Version Guards Summary

One-liner: Added reconcileLinks for stale data.json pruning before TUI, a non-interactive `list` command, and forward-compat schema version warnings in both config.js and package-state.js.

## What Was Built

- **ROB-03 (stale state reconciliation):** New `reconcileLinks(pkg, projectPath)` export in package-state.js. Cross-validates each data.json entry against the live filesystem — prunes entries where symlink is missing, not a symlink, or points to wrong target. Only writes data.json when changes detected. Deletes project key entirely when all entries pruned. Called per-package in manage.js startup loop before `getInstalledPackages`, ensuring TUI always reflects filesystem reality.

- **UX-01 (list command):** New `src/commands/list.js` with `listCommand()` handler. Shows installed packages for the current project directory using `getInstalledPackages` (same source of truth as manage). Registered in bin/clawd-linker.js as `list` with alias `ls`. Non-interactive — no TUI required.

- **UX-03 (schema version guards):** Forward-compat warning added to `readState` in package-state.js: warns when `schemaVersion > 1`. Same guard added to `getRepoPath` in config.js after JSON parse succeeds. Both warnings include the actual version number from the file. Advisory only (console.warn), not an error — groundwork for future schema migrations.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | 7075572 | feat(02-02): add reconcileLinks to package-state.js and wire into manage.js startup |
| Task 2 | b04c3cf | feat(02-02): add list command and schema version forward-compat guards |

## Decisions Made

1. **reconcileLinks path computation**: `expectedSource` recomputed from `pkg.filesPath + path.relative(projectPath, linkPath)` at runtime. No source paths stored in data.json (Pitfall 1 avoidance).
2. **Write guard**: `if (changed)` guard before `writeState` prevents unnecessary I/O when all entries are already valid (Pitfall 5 avoidance).
3. **Schema warnings are advisory**: `console.warn` not `console.error` + no `process.exit`. Schema version is not a security boundary in this single-user tool.
4. **list uses data.json as source of truth**: Consistent with manage — both read from data.json via `getInstalledPackages`, not from filesystem symlink inspection.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] Schema version guard added to readState in Task 1**

- **Found during:** Task 1 (while adding chalk import and path import to package-state.js)
- **Issue:** The plan put the schema version guard for package-state.js in Task 2, but chalk was being imported in Task 1 anyway for the reconcileLinks yellow warning. Adding the readState guard at the same time avoided a second pass over the file.
- **Fix:** Added `parsed.schemaVersion > 1` check with console.warn inside readState during Task 1 commit; Task 2 verification confirmed it was already present.
- **Files modified:** src/services/package-state.js
- **Commit:** 7075572

## Known Stubs

None - all functionality is fully wired.

## Threat Flags

None - threat model reviewed. T-02-04 (data.json paths to lstat/readlink) accepted as per plan — reconcileLinks only reads (lstat/readlink), never creates/deletes, and paths come from trusted pkg.filesPath. T-02-05 and T-02-06 accepted as per plan.

## Self-Check: PASSED
