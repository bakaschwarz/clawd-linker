---
phase: 02-robustness-polish
fixed_at: 2026-04-08T00:00:00Z
review_path: .planning/phases/02-robustness-polish/02-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 02: Code Review Fix Report

**Fixed at:** 2026-04-08T00:00:00Z
**Source review:** .planning/phases/02-robustness-polish/02-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4
- Fixed: 4
- Skipped: 0

## Fixed Issues

### CR-01: Path-prefix check in `cleanEmptyDirs` can escape the project root

**Files modified:** `src/services/symlink-manager.js`
**Commit:** c46a099
**Applied fix:** Introduced `projectRoot` variable that appends `path.sep` to `projectPath` before the string-prefix comparison. The `while` loop now uses `dir.startsWith(projectRoot)` instead of `dir.startsWith(projectPath)`, so a sibling directory like `/home/user/myproject-backup` is correctly rejected because it does not start with `/home/user/myproject/`.

### WR-01: Out-of-tree `linkPath` in `data.json` causes path traversal in `reconcileLinks`

**Files modified:** `src/services/package-state.js`
**Commit:** c229c97
**Applied fix:** Added an early-continue guard immediately after computing `relPath`. If `relPath.startsWith('..')`, the `linkPath` lies outside `projectPath`; the entry is treated as stale (`changed = true; continue`) and is pruned from `data.json` on the next write.

### WR-02: `new` command rejects valid package names containing `..` as a substring

**Files modified:** `src/commands/new.js`
**Commit:** a929fde
**Applied fix:** Replaced the `name.includes('..')` check with a segment-aware test. The name is split on `/` and `\` via `split(/[/\\]/)`. The guard rejects names that produce more than one segment (contains a separator) or whose single segment is the literal `..` or `.`. Names like `my..package` are now accepted because they produce a single segment that is neither `..` nor `.`.

### WR-03: Version hardcoded in `bin/clawd-linker.js` instead of read from `package.json`

**Files modified:** `bin/clawd-linker.js`
**Commit:** 29cec19
**Applied fix:** Added `import { createRequire } from 'module'` and used `createRequire(import.meta.url)` to require `../package.json` in an ESM context. The `version` field is destructured and passed to `.version(version)` on the commander program. Verified with `node bin/clawd-linker.js --version` which outputs `0.1.0` correctly.

---

_Fixed: 2026-04-08T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
