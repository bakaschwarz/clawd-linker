---
phase: 02-robustness-polish
reviewed: 2026-04-08T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - README.md
  - bin/clawd-linker.js
  - src/commands/init.js
  - src/commands/list.js
  - src/commands/manage.js
  - src/commands/new.js
  - src/config.js
  - src/services/package-registry.js
  - src/services/package-state.js
  - src/services/symlink-manager.js
  - src/utils/fs.js
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-04-08T00:00:00Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

The codebase is well-structured for a personal CLI tool. Error handling is generally thorough, atomic writes are used correctly for config and state files, and the reconciliation logic is sound. Three issues deserve attention before the robustness phase closes: a path-prefix comparison bug in `cleanEmptyDirs` that can touch directories outside the project, a path traversal risk in `reconcileLinks` when `data.json` holds out-of-tree link paths, and an overly broad `..` check in `new` that rejects valid package names containing double dots.

---

## Critical Issues

### CR-01: Path-prefix check in `cleanEmptyDirs` can escape the project root

**File:** `src/services/symlink-manager.js:139`
**Issue:** The guard `dir.startsWith(projectPath)` uses raw string prefix matching. If `projectPath` is `/home/user/myproject`, then a directory at `/home/user/myproject-backup` passes the check because the string starts with `/home/user/myproject`. After uninstalling a package, the tool would attempt `rmdir` on sibling directories that happen to share the project name as a prefix. `rmdir` only removes empty directories so data loss is unlikely, but removing an unrelated directory is a correctness bug.

**Fix:**
```js
// Ensure `dir` is a true sub-path of projectPath, not just a string prefix match.
// Append a separator to the boundary so sibling dirs are rejected.
const projectRoot = projectPath.endsWith(path.sep) ? projectPath : projectPath + path.sep;

while (dir !== projectPath && dir.startsWith(projectRoot)) {
  dirs.add(dir);
  dir = path.dirname(dir);
}
```

---

## Warnings

### WR-01: Out-of-tree `linkPath` in `data.json` causes path traversal in `reconcileLinks`

**File:** `src/services/package-state.js:83-84`
**Issue:** `reconcileLinks` reads link paths directly from `data.json` without validating that they fall inside `projectPath`. The `path.relative(projectPath, linkPath)` call returns a `../`-prefixed relative path when `linkPath` is outside `projectPath`. That relative path is then fed into `path.resolve(pkg.filesPath, relPath)` which resolves to a location outside the `files/` directory. If `data.json` is manually edited (or corrupted), symlink validation silently compares against a source path the tool never created.

This is low-exploitability for a personal tool but the fix is a one-liner guard:

**Fix:**
```js
// Add after computing relPath (line 83):
if (relPath.startsWith('..')) {
  // linkPath escapes projectPath — treat as stale and prune
  changed = true;
  continue;
}
```

### WR-02: `new` command rejects valid package names containing `..` as a substring

**File:** `src/commands/new.js:24`
**Issue:** The path-traversal guard is `name.includes('..')`. This correctly blocks `../evil` but also incorrectly blocks legitimate names like `my..package` or `v2..3`. The actual attack vector is path separators (`/`, `\`) and the literal sequence `..` as a segment — not `..` embedded in a longer string. A tighter check is more accurate:

**Fix:**
```js
// Replace the current check with a segment-aware test:
const parts = name.split(/[/\\]/);
if (parts.length > 1 || parts[0] === '..' || parts[0] === '.') {
  console.error(chalk.red(`Package name must not contain path separators or be a relative reference.`));
  process.exit(1);
}
```
This still blocks `/`, `\`, bare `..`, and bare `.` while allowing `my..package`.

### WR-03: Version hardcoded in `bin/clawd-linker.js` instead of read from `package.json`

**File:** `bin/clawd-linker.js:12`
**Issue:** `.version('0.1.0')` is hardcoded. When the version is bumped in `package.json`, `--version` output will remain stale. This causes confusing diagnostics when users report issues.

**Fix:**
```js
// Add at top of file:
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { version } = require('../package.json');

// Then replace:
.version(version)
```

---

## Info

### IN-01: `init` command does not sanitize the repo path input against path traversal

**File:** `src/commands/init.js:34-39`
**Issue:** The `repoPath` value entered interactively is passed to `path.resolve()` and then `mkdir({ recursive: true })` without any validation. A user could type an adversarial path; however, since this is a personal tool where the user is also the operator this is purely informational — there is no meaningful threat model here.

### IN-02: `walkFiles` throws if `filesPath` directory is empty — misleading error surface

**File:** `src/utils/fs.js:24-30`
**Issue:** `readdir` on an empty directory returns `[]`, which is fine. However, if the `files/` directory is somehow removed between `listPackages` checking it and `walkFiles` being called, `readdir` will throw `ENOENT`. This error bubbles up to `installPackage`, which re-throws it to the `manage` command's catch block. The error message from the OS (`ENOENT: no such file or directory`) is surfaced correctly via the error accumulation pattern in `manage.js`, so this is informational only — the existing error handling in `manage.js` lines 110-113 covers it adequately.

---

_Reviewed: 2026-04-08T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
