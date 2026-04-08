# Phase 2: Robustness + Polish — Research

**Researched:** 2026-04-08
**Domain:** Node.js ESM CLI robustness patterns — dry-run, headless/non-TTY, stale state reconciliation, empty directory cleanup, new subcommand
**Confidence:** HIGH

---

## Summary

Phase 2 adds six requirements on top of the working Phase 1 core. All six fit cleanly into the existing code structure with no new dependencies. The technical patterns are straightforward and verified against the live codebase.

The most complex requirement is **ROB-03** (stale state reconciliation): the `manage` startup path must cross-validate every `data.json` entry against the actual filesystem using `lstat` + `readlink`, remove entries that are missing or wrong, then continue to the TUI. The reconciliation logic must distinguish four link states: `ok`, `missing`, `wrong-target`, and `not-a-symlink` — each with a different repair action. Verified empirically [VERIFIED: live test].

**UX-02** (headless/non-TTY mode) requires care: `@inquirer/prompts` throws `ExitPromptError` when stdin is non-TTY and the prompt receives EOF. The strategy is to detect `--yes` flag or `!process.stdin.isTTY` before opening any prompt and bypass the TUI entirely, applying all currently-installed packages as the selection. [VERIFIED: live test].

**Primary recommendation:** Implement all six requirements as isolated, self-contained changes — each requirement touches at most two files and requires no new dependencies.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ROB-01 | `--dry-run` flag shows what would be symlinked/removed without making changes | Commander option added to `manage` command; dry-run flag threaded through `installPackage`/`uninstallPackage`; no `fs` writes when flag set |
| ROB-02 | Empty directories left behind after uninstall are cleaned up automatically | Collect unique parent dirs of removed symlinks; sort deepest-first; `rmdir` each if empty; stop at project root |
| ROB-03 | Live filesystem cross-validation on `manage` startup; auto-repair stale state | `lstat` + `readlink` per recorded link; four status cases; prune stale entries from `data.json` before TUI renders |
| UX-01 | `npx clawd-linker list` command shows installed packages without opening TUI | New `list` subcommand in `bin/clawd-linker.js` and `src/commands/list.js`; reuses `getInstalledPackages` from `package-state.js` |
| UX-02 | Non-TTY / `--yes` mode for scripted/headless installs | Detect `--yes` or `!process.stdin.isTTY` before any `@inquirer` call; bypass TUI; treat all currently-installed packages as selection (no-op for scripted callers without explicit selection) |
| UX-03 | Schema version field in `~/.clawd-linker` and `data.json` for future migration support | `schemaVersion: 1` already written by `config.js` and `package-state.js`; requirement is satisfied by verifying the field is present on read and preserving it on write |
</phase_requirements>

---

## Standard Stack

### Core (unchanged from Phase 1)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `commander` | 14.0.3 | Argument parsing, `--dry-run`/`--yes` options, new `list` command | Already installed; `.option()` returns camelCase key in action handler opts |
| `@inquirer/prompts` | 8.4.1 | Interactive TUI; must be bypassed in headless mode | Already installed; throws `ExitPromptError` in non-TTY |
| `chalk` | 5.6.2 | Output coloring for dry-run preview and list output | Already installed |
| `fs/promises` (built-in) | Node 24.14.0 | `lstat`, `readlink`, `rmdir`, `readdir` for reconciliation and dir cleanup | All APIs available and verified [VERIFIED: live test] |

**No new dependencies required for Phase 2.** [VERIFIED: all patterns achievable with existing stack]

### Installation

```bash
# No new packages needed
```

---

## Architecture Patterns

### Recommended Project Structure Changes

```
src/
├── commands/
│   ├── init.js          # unchanged
│   ├── new.js           # unchanged
│   ├── manage.js        # add --dry-run/--yes options, ROB-03 reconciliation on startup
│   └── list.js          # NEW — UX-01
├── services/
│   ├── package-registry.js   # unchanged
│   ├── package-state.js      # add reconcileState() helper — ROB-03
│   └── symlink-manager.js    # add dryRun param, add cleanEmptyDirs() — ROB-01, ROB-02
└── utils/
    └── fs.js            # add rmdir export — ROB-02
bin/
└── clawd-linker.js      # add list command registration, add options to manage
```

### Pattern 1: Commander Options on manage Command

Add `.option()` calls before `.action()` in `bin/clawd-linker.js`. Commander camelCases `--dry-run` → `dryRun`. The action handler receives `(options, command)` when options are defined. [VERIFIED: live test]

```javascript
// Source: verified via live commander 14.0.3 test
program
  .command('manage')
  .alias('m')
  .description('Manage installed packages for this project')
  .option('--dry-run', 'Preview changes without making any filesystem changes')
  .option('-y, --yes', 'Skip confirmation prompts (headless/scripted use)')
  .action(manageCommand);
```

The `manageCommand` signature changes from `async function manageCommand()` to `async function manageCommand(options)` where `options.dryRun` and `options.yes` are booleans.

### Pattern 2: Dry-Run Threading (ROB-01)

Thread `dryRun` boolean through `installPackage(pkg, projectPath, conflictCallback, { dryRun })` and `uninstallPackage(pkg, projectPath, { dryRun })`. When `dryRun: true`:
- Skip all `fs.symlink`, `fs.unlink`, `fs.mkdir`, `fs.writeFile` calls
- Log `[dry-run] would create: <path>` / `[dry-run] would remove: <path>` using chalk
- Return the same result arrays as if the operation had run (for accurate reporting)

This keeps the dry-run logic inside `symlink-manager.js` rather than duplicating it in `manage.js`. [ASSUMED: preferred encapsulation — either layer is valid]

### Pattern 3: Empty Directory Cleanup (ROB-02)

After `uninstallPackage` returns the list of removed symlink paths, compute unique parent directories, sort deepest-first (longest path first), and call `rmdir` on each. Stop climbing when a directory is non-empty or equals the project root.

```javascript
// Source: verified via live Node.js 24.14.0 test
async function cleanEmptyDirs(removedPaths, projectPath) {
  const dirs = new Set();
  for (const p of removedPaths) {
    let dir = path.dirname(p);
    while (dir !== projectPath && dir.startsWith(projectPath)) {
      dirs.add(dir);
      dir = path.dirname(dir);
    }
  }
  const sorted = [...dirs].sort((a, b) => b.length - a.length); // deepest first
  for (const dir of sorted) {
    try {
      const entries = await readdir(dir);
      if (entries.length === 0) await rmdir(dir);
    } catch {
      // Non-empty (ENOTEMPTY) or already removed — skip silently
    }
  }
}
```

Key verified behaviors [VERIFIED: live test]:
- `rmdir` on a non-empty directory throws `ENOTEMPTY` — catch and skip
- `readdir` before `rmdir` gives a race-condition-safe alternative: check empty first
- Sorting by path length (deepest first) ensures children are removed before parents
- Do NOT use `rm({ recursive: true })` — that would delete non-empty dirs with content

### Pattern 4: Stale State Reconciliation (ROB-03)

On `manage` startup, before opening the TUI, iterate all packages' `data.json` entries for the current project. For each recorded symlink path, check its actual filesystem state.

**Four status cases verified empirically [VERIFIED: live test]:**

| Status | Detection | Repair Action |
|--------|-----------|---------------|
| `ok` | `lstat` isSymbolicLink AND `readlink` === expected source | None — keep in state |
| `missing` | `lstat` returns null | Remove from state array |
| `wrong-target` | `lstat` isSymbolicLink AND `readlink` !== expected source | Remove from state (symlink was re-pointed by other means) |
| `not-a-symlink` | `lstat` succeeds but NOT isSymbolicLink | Remove from state (real file replaced symlink) |

```javascript
// Source: verified via live Node.js 24.14.0 test
async function checkLinkStatus(linkPath, expectedSource) {
  const stat = await lstat(linkPath).catch(() => null);
  if (!stat) return 'missing';
  if (!stat.isSymbolicLink()) return 'not-a-symlink';
  const target = await readlink(linkPath);
  if (target !== expectedSource) return 'wrong-target';
  return 'ok';
}
```

After reconciliation, if any entries were pruned, `writeState` is called before the TUI opens. The TUI then reflects reality, not stale state.

**Where to implement:** `reconcileState(pkg, projectPath)` as a new exported function in `package-state.js`. Called from `manage.js` in a loop over all packages before the `checkbox` prompt. [ASSUMED: service layer placement]

### Pattern 5: Headless / Non-TTY Mode (UX-02)

`@inquirer/prompts` throws `ExitPromptError` when stdin is non-TTY and the prompt receives EOF [VERIFIED: live test — `echo "" | node` triggers this].

`process.stdin.isTTY` is `true` when connected to an interactive terminal; it is `undefined` (falsy) when piped/redirected.

**Strategy:** Detect before any prompt is called.

```javascript
// Source: verified via live Node.js 24.14.0 test
const isHeadless = options.yes || !process.stdin.isTTY;

if (isHeadless) {
  // In headless mode with no explicit selection, default to "no changes":
  // keep currently installed packages installed, install nothing new.
  // This is a safe no-op for scripted callers who don't pass a selection mechanism.
  // Headless + --yes proceeds with current selection as confirmation.
  // ... apply toInstall/toUninstall without prompts
}
```

**Headless behavior for manage:**
- Skip `checkbox` prompt — use `installed` set as the selection (no changes is safe default)
- Skip `confirm` prompt — `--yes` auto-confirms; non-TTY without `--yes` = skip with warning
- Skip per-conflict `confirm` — default to `'skip'` (safe) unless `--yes` is set

**Headless behavior for new `--yes` flag on conflict:** when `--yes` + conflict exists, overwrite. When headless without `--yes` + conflict exists, skip (print warning).

### Pattern 6: `list` Command (UX-01)

New command file `src/commands/list.js`. Reuses `getRepoPath()`, `listPackages()`, and `getInstalledPackages()` from existing services — no new logic required.

```javascript
// Pattern — no new dependencies
export async function listCommand() {
  const repoPath = await getRepoPath();
  const projectPath = path.resolve(process.cwd());
  const packages = await listPackages(repoPath);
  const installed = await getInstalledPackages(projectPath, packages);

  if (installed.size === 0) {
    console.log(chalk.yellow('No packages installed in this project.'));
    return;
  }

  for (const pkg of packages) {
    if (installed.has(pkg.name)) {
      console.log(chalk.green(`  ✓ ${pkg.name}`));
    }
  }
}
```

Registered in `bin/clawd-linker.js`:
```javascript
program
  .command('list')
  .description('Show installed packages for this project')
  .action(listCommand);
```

### Pattern 7: Schema Version Verification (UX-03)

`schemaVersion: 1` is already written in both `config.js` and `package-state.js` (new command). UX-03 is satisfied by:
1. Verifying `schemaVersion` is read and preserved on write (already done — `writeState` serializes the full state object)
2. Adding a forward-compat guard on read: if `schemaVersion` is present but > 1, log a warning [ASSUMED: whether to warn or error is discretionary]

No schema migration logic is needed for Phase 2 — this is groundwork for future phases.

### Anti-Patterns to Avoid

- **Using `rm({ recursive: true })` for cleanup:** This deletes non-empty directories. Use `rmdir` (fails on non-empty) with a caught `ENOTEMPTY`. [VERIFIED: live test confirms `ENOTEMPTY` behavior]
- **Calling `@inquirer` in non-TTY without checking first:** Throws `ExitPromptError` with opaque message. Check `process.stdin.isTTY` before any prompt call. [VERIFIED: live test]
- **Mutating `data.json` during reconciliation loop:** Read all states first, compute repairs, then write — avoids partial writes if the loop is interrupted.
- **Reconciling against `files/` contents instead of `data.json`:** ROB-03 is about `data.json` entries vs filesystem reality, NOT about re-walking `files/`. Walking `files/` is install logic, not reconciliation.
- **Climbing above project root in dir cleanup:** The cleanup loop must stop at `projectPath`. Without this guard, edge cases with very short paths could climb into parent dirs. [VERIFIED: pattern tested]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Option parsing for `--dry-run`/`--yes` | Custom `process.argv` parsing | `commander` `.option()` | Already installed; handles types, help text, camelCase |
| Atomic state write | Custom tmp + copy | `writeState()` from `package-state.js` | Already implemented with tmp + rename pattern |
| TTY detection | Custom `/dev/tty` open | `process.stdin.isTTY` (Node built-in) | Reliable, works with piping, no dependencies |
| Empty dir detection | Custom size counting | `readdir()` + check `.length === 0` | Simpler and race-safe vs checking size |

---

## Common Pitfalls

### Pitfall 1: Stale `data.json` Has Wrong Expected Source Path

**What goes wrong:** Reconciliation compares `readlink(linkPath)` against the expected source, but if the package repo was moved, all expected sources will appear as `wrong-target` and the entire state gets pruned.

**Why it happens:** `data.json` doesn't store the source path — it only stores the project-side target paths. The expected source must be recomputed from `pkg.filesPath + relPath` at reconciliation time, which depends on the current `repoPath` from config.

**How to avoid:** Recompute expected source from `pkg.filesPath` during reconciliation (same way `installPackage` does). If the repo was moved, reconciliation correctly detects all links as wrong-target and prunes them — this is correct behavior (user needs to reinstall). Do NOT hardcode source paths into `data.json`.

**Warning signs:** All packages show as "not installed" after moving the repo path.

### Pitfall 2: `process.stdin.isTTY` is `undefined` Not `false`

**What goes wrong:** Code checks `process.stdin.isTTY === false` and misses the non-TTY case.

**Why it happens:** Node.js sets `isTTY` to `true` on TTY streams and leaves it `undefined` (not `false`) on non-TTY streams. [VERIFIED: live test — confirmed `undefined` in all non-TTY cases]

**How to avoid:** Use falsy check: `!process.stdin.isTTY` (catches both `undefined` and `false`).

### Pitfall 3: Dry-Run Modifies `data.json`

**What goes wrong:** Dry-run correctly skips symlink creation but still calls `writeState()`, updating `data.json` as if installation happened.

**Why it happens:** The symlink skip is in `symlink-manager.js` but state write is a separate code path that's easy to forget.

**How to avoid:** Guard `writeState()` calls with `if (!dryRun)` in `installPackage` and `uninstallPackage`.

### Pitfall 4: Empty Dir Cleanup Removes Dirs Not Owned by the Package

**What goes wrong:** Cleanup removes a directory that still has files from another package installed in it.

**Why it happens:** The cleanup only reads `readdir()` to check if a directory is empty — if another package installed files in the same dir, `readdir` returns non-empty and `rmdir` is skipped. This is actually correct behavior.

**Risk:** No risk — the `readdir` guard prevents this. Document it explicitly so the implementation doesn't add additional ownership checking that would over-complicate the logic.

### Pitfall 5: Reconciliation Writes State for Every Package Even If Unchanged

**What goes wrong:** `writeState()` is called for all packages, creating spurious writes and touching mtime on all `data.json` files.

**Why it happens:** Unconditional write after reconciliation loop.

**How to avoid:** Track whether any entries were pruned per package; only call `writeState()` if `changed === true`.

---

## Code Examples

### Reconcile State — Core Function

```javascript
// Source: verified pattern via live Node.js 24.14.0 lstat/readlink tests
import { lstat, readlink } from '../utils/fs.js';
import path from 'path';

/**
 * Cross-validate data.json entries against actual filesystem.
 * Returns pruned link list (only verified-ok entries).
 * @param {string[]} recordedLinks - Absolute paths from data.json
 * @param {string} pkgFilesPath - Package's files/ dir (to compute expected sources)
 * @param {string} projectPath - Project root (to compute relative paths)
 * @returns {Promise<{prunedLinks: string[], changed: boolean}>}
 */
async function reconcileLinks(recordedLinks, pkgFilesPath, projectPath) {
  const prunedLinks = [];
  let changed = false;

  for (const linkPath of recordedLinks) {
    const relPath = path.relative(projectPath, linkPath);
    const expectedSource = path.resolve(pkgFilesPath, relPath);

    const stat = await lstat(linkPath).catch(() => null);
    if (!stat || !stat.isSymbolicLink()) { changed = true; continue; }
    const target = await readlink(linkPath);
    if (target !== expectedSource) { changed = true; continue; }
    prunedLinks.push(linkPath); // ok
  }

  return { prunedLinks, changed };
}
```

### Headless Mode Guard

```javascript
// Source: verified via live process.stdin.isTTY test
const isHeadless = options.yes || !process.stdin.isTTY;

if (isHeadless) {
  // No interactive prompts — apply as no-op (same selection as current state)
  const toInstall = [];  // headless manage: don't install new things without explicit instruction
  const toUninstall = [];
  console.log(chalk.yellow('Running in headless mode. No changes applied (use manage interactively to change selection).'));
  return;
}
```

Note: for UX-02, the exact headless behavior (no-op vs. honor current state) is a discretion area — the research shows the mechanism; the planner chooses the behavior.

### Dry-Run Output Pattern

```javascript
// Pattern from common CLI convention [ASSUMED: no official standard for dry-run output format]
if (dryRun) {
  console.log(chalk.cyan(`  [dry-run] would create symlink: ${path.relative(projectPath, target)}`));
} else {
  await symlink(source, target);
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `process.stdin.isTTY === false` | `!process.stdin.isTTY` | Node.js always | Falsy check catches `undefined` (non-TTY) |
| `rmdir` with `recursive: true` (deprecated) | `rm({ recursive: true })` or guarded `rmdir` | Node 16 | `rmdir({ recursive })` was deprecated; use `rm({ recursive })` for recursive removal; bare `rmdir` for intentionally-empty-only removal |
| Prompt libraries that throw on non-TTY | Detect non-TTY before calling | @inquirer v8+ | `ExitPromptError` is thrown — must guard before calling |

**Deprecated/outdated:**
- `rmdir({ recursive: true })`: Deprecated in Node 16, removed in Node 22. Use `rm({ recursive: true })` for recursive deletion. For Phase 2 ROB-02 (remove only empty dirs), use bare `rmdir` with error handling — this is the correct modern API.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Dry-run logic lives in `symlink-manager.js` rather than `manage.js` | Architecture Patterns, Pattern 2 | Low — either location works; service layer keeps manage.js clean |
| A2 | Reconcile logic lives in `package-state.js` as exported helper | Architecture Patterns, Pattern 4 | Low — could also live in manage.js; service placement is cleaner |
| A3 | Headless `manage` with no `--yes` defaults to no-op (keep current state, no new installs) | Pattern 5, Code Examples | Medium — user might expect `--yes` to confirm current TUI state; clarify in plan |
| A4 | `schemaVersion` forward-compat guard logs a warning (not an error) when version > 1 | Architecture Patterns, Pattern 7 | Low — only matters if a future schema version is introduced |
| A5 | Dry-run output format uses `[dry-run] would create/remove:` prefix | Code Examples | Low — cosmetic; any clear format is acceptable |

---

## Open Questions (RESOLVED)

1. **Headless `manage` behavior with `--yes`**
   - What we know: `--yes` signals "skip confirmation prompts"
   - What's unclear: In headless mode with `--yes`, what is the "selection"? The currently-installed set (no-op)? All packages? Or only packages explicitly named?
   - Recommendation: Default to current installed set (no-op) — safest. If caller wants to install, they use `--yes` after specifying packages some other way (future scope). Document this behavior clearly.
   - **RESOLVED:** Headless mode (`--yes` or non-TTY) exits early with an informational no-op message. No install/uninstall occurs without TUI interaction. (Plan 02-01, Task 2)

2. **Reconciliation: prune vs. auto-reinstall stale links**
   - What we know: ROB-03 says "auto-repair stale state"
   - What's unclear: "auto-repair" = (a) prune stale entries from `data.json` so TUI shows correct state, or (b) attempt to re-create missing symlinks automatically
   - Recommendation: Interpretation (a) — prune `data.json` to match reality, then let the TUI let the user choose. Re-creating symlinks automatically without user input violates the "no silent installs" principle. The success criteria says "cross-validated against the live filesystem and auto-repaired before the TUI renders" which supports (a).
   - **RESOLVED:** Prune-only (interpretation a). `reconcileLinks` removes stale `data.json` entries for links that are missing, wrong-target, or not a symlink. Does not re-create missing symlinks. (Plan 02-02, Task 1)

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | All | ✓ | 24.14.0 | — |
| `fs/promises.rmdir` | ROB-02 | ✓ | Built-in (Node 20+) | — |
| `fs/promises.readdir` | ROB-02, ROB-03 | ✓ | Built-in | — |
| `fs/promises.readlink` | ROB-03 | ✓ | Built-in | — |
| `commander` 14.0.3 | ROB-01, UX-01, UX-02 | ✓ | 14.0.3 | — |
| `@inquirer/prompts` 8.4.1 | UX-02 (to bypass) | ✓ | 8.4.1 | — |
| `chalk` 5.6.2 | All output | ✓ | 5.6.2 | — |

**Missing dependencies with no fallback:** None.

**Step 2.6 conclusion:** All required dependencies are available. No new packages required.

---

## Sources

### Primary (HIGH confidence)
- Live Node.js 24.14.0 test — `lstat`/`readlink` stale symlink detection [VERIFIED]
- Live Node.js 24.14.0 test — `rmdir` on non-empty throws `ENOTEMPTY` [VERIFIED]
- Live Node.js 24.14.0 test — bottom-up empty dir cleanup algorithm [VERIFIED]
- Live Node.js 24.14.0 test — `process.stdin.isTTY` is `undefined` in all non-TTY cases [VERIFIED]
- Live commander 14.0.3 test — `.option()` camelCase, action handler receives `(opts)` [VERIFIED]
- Live @inquirer/prompts 8.4.1 test — throws `ExitPromptError` when non-TTY stdin receives EOF [VERIFIED]
- Codebase read — `package-state.js`, `symlink-manager.js`, `manage.js`, `config.js`, `package-registry.js`, `bin/clawd-linker.js`, `utils/fs.js` [VERIFIED]

### Secondary (MEDIUM confidence)
- Node.js docs — `rmdir({ recursive })` deprecated in Node 16 [ASSUMED from training — Node 24 behavior confirmed live but deprecation timeline from training knowledge]

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified installed and tested live
- Architecture: HIGH — verified against actual codebase; patterns confirmed working
- Pitfalls: HIGH — empirically tested, not just assumed
- Open questions: Require planner decisions but do not block implementation

**Research date:** 2026-04-08
**Valid until:** 2026-05-08 (stable ecosystem — chalk, commander, @inquirer/prompts change slowly)
