---
phase: 01-core-symlink-engine
verified: 2026-04-08T12:00:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Run full E2E lifecycle: init -> new -> manage -> verify symlinks -> re-run -> uninstall -> error"
    expected: "All 7 test scenarios from 01-04-PLAN.md pass: git repo created, symlinks absolute, pre-check works, no-op on re-run, uninstall cleans up, red error on missing repo"
    why_human: "The TUI (checkbox, confirm prompts from @inquirer/prompts) cannot be driven programmatically without a TTY. Symlink correctness and conflict-backup behavior must be observed in a live shell session. The 01-04 SUMMARY.md reports all 7 scenarios passed, but this verifier cannot reproduce that confirmation independently."
---

# Phase 01: Core Symlink Engine Verification Report

**Phase Goal:** A developer can run all three commands — `init`, `new`, and `manage` — to create a package repo, scaffold packages, and manage symlinks across projects with correct state tracking and conflict handling.
**Verified:** 2026-04-08
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

All five roadmap success criteria were evaluated against the actual codebase.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can run `npx clawd-linker init` to create a git-initialized package repo, have its path stored at `~/.clawd-linker`; re-running with valid config warns and exits cleanly | VERIFIED | `src/commands/init.js` reads `CONFIG_PATH` before prompting, emits `chalk.yellow` warning and returns early when repo exists. Calls `simpleGit(resolved).init()` and `setRepoPath(resolved)`. All imports via `utils/fs.js`. |
| 2 | User can run `npx clawd-linker new <name>` to scaffold a package directory with `files/`, `PACKAGE.md`, and a gitignored `data.json` | VERIFIED | `src/commands/new.js` creates `filesPath` via `mkdir`, writes `PACKAGE.md`, `data.json` with `{schemaVersion:1, installedIn:{}}`, and `.gitignore` containing `data.json`. Checks for existing package before creating. |
| 3 | User can run `npx clawd-linker manage` from a project directory, see all packages with installed ones pre-checked, confirm a selection, and have the correct symlinks created or removed | VERIFIED | `src/commands/manage.js` calls `getInstalledPackages`, passes `checked: installed.has(pkg.name)` to `@inquirer/prompts` `checkbox`, computes `toInstall`/`toUninstall` diff, calls `installPackage`/`uninstallPackage` after confirm. |
| 4 | Symlinks are created per-file (not per-directory), use absolute paths, create parent directories as needed, and are removed cleanly on uninstall | VERIFIED | `installPackage` calls `walkFiles(pkg.filesPath)` (file-level), uses `path.resolve()` on both source and target, calls `mkdir(path.dirname(target), {recursive:true})`, and `uninstallPackage` removes only `lstat`-confirmed symlinks from `data.json`. |
| 5 | Running `manage` twice with the same selection is a no-op; when a real file exists at a symlink target the user is prompted per-conflict to skip or overwrite | VERIFIED | `installPackage` checks `readlink(target) === source` and continues without re-creating. `manage.js` returns `"No changes needed."` when diff is empty. `conflictCallback` calls `inquirerConfirm` per-conflict and `rename(target, target + '.clawd-backup')` on overwrite. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Provided | Status | Details |
|----------|----------|--------|---------|
| `package.json` | npm package definition with ESM, bin entry, dependencies | VERIFIED | `"type":"module"`, `"bin":{"clawd-linker":"./bin/clawd-linker.js"}`, `"engines":{"node":">=20.12.0"}`, all 5 runtime deps present |
| `bin/clawd-linker.js` | CLI entry point with shebang and commander routing | VERIFIED | `#!/usr/bin/env node`, imports all 3 commands, registers `init`, `new <name>`, `manage` (alias `m`), calls `program.parse()` |
| `src/utils/fs.js` | Single fs boundary — re-exports fs/promises + walkFiles | VERIFIED | Only file in `src/` importing from `fs/promises`. Exports all 10 fs functions plus `walkFiles`. Uses `e.parentPath ?? e.path` for Node 20–24 compatibility. |
| `src/config.js` | Global config read/write at `~/.clawd-linker` | VERIFIED | Exports `getRepoPath`, `setRepoPath`, `CONFIG_PATH`. Atomic write (tmp+rename). Validates `typeof raw.repoPath === 'string'`. Exits with `chalk.red` on all failure cases. |
| `src/services/package-registry.js` | Package discovery | VERIFIED | Exports `listPackages`. Skips dot-directories and any dir without `files/` subdirectory. Returns `PackageDescriptor[]` sorted by name. |
| `src/services/package-state.js` | data.json read/write with per-symlink ownership | VERIFIED | Exports `readState`, `writeState`, `getInstalledPackages`. Atomic write via tmp+rename. Validates `installedIn` shape. Returns empty state on corrupt/missing file. |
| `src/services/symlink-manager.js` | Symlink create/remove engine with conflict detection | VERIFIED | Exports `installPackage`, `uninstallPackage`. Per-file absolute symlinks, parent-dir creation, idempotency via `readlink`, conflict callback, backup on overwrite. |
| `src/commands/init.js` | init command | VERIFIED | Exports `initCommand`. Reads config before prompting. Uses `simpleGit().init()`. Calls `setRepoPath`. |
| `src/commands/new.js` | new command | VERIFIED | Exports `newCommand`. Creates full package scaffold. Static import of `access` (not dynamic). |
| `src/commands/manage.js` | manage command — TUI for package selection | VERIFIED | Exports `manageCommand`. Full diff-driven install/uninstall with pre-check state and conflict prompting. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/config.js` | `src/utils/fs.js` | import | WIRED | `import { readFile, writeFile, rename, access } from './utils/fs.js'` |
| `src/services/package-registry.js` | `src/utils/fs.js` | import | WIRED | `import { readdir, access } from '../utils/fs.js'` |
| `src/services/package-state.js` | `src/utils/fs.js` | import | WIRED | `import { readFile, writeFile, rename } from '../utils/fs.js'` |
| `src/services/symlink-manager.js` | `src/utils/fs.js` | import | WIRED | `import { walkFiles, symlink, unlink, lstat, readlink, mkdir, rename } from '../utils/fs.js'` |
| `bin/clawd-linker.js` | `src/commands/init.js` | import | WIRED | `import { initCommand } from '../src/commands/init.js'` |
| `bin/clawd-linker.js` | `src/commands/new.js` | import | WIRED | `import { newCommand } from '../src/commands/new.js'` |
| `bin/clawd-linker.js` | `src/commands/manage.js` | import | WIRED | `import { manageCommand } from '../src/commands/manage.js'` |
| `src/commands/manage.js` | `@inquirer/prompts` | import | WIRED | `import { checkbox, confirm as inquirerConfirm } from '@inquirer/prompts'` |
| `src/commands/init.js` | `simple-git` | import | WIRED | `import simpleGit from 'simple-git'` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `manage.js` | `packages` | `listPackages(repoPath)` → `readdir(repoPath)` | Yes — reads live filesystem entries | FLOWING |
| `manage.js` | `installed` | `getInstalledPackages(projectPath, packages)` → `readState(pkg.dataJsonPath)` → `readFile` | Yes — reads `data.json` from disk | FLOWING |
| `manage.js` | `selected` | `@inquirer/prompts` checkbox prompt | Yes — real TTY user input | FLOWING (human) |
| `symlink-manager.js` | `ownedLinks` | `walkFiles(pkg.filesPath)` → `readdir()` recursive | Yes — reads live package files directory | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| CLI --help shows all three commands | `node bin/clawd-linker.js --help` | Shows `init`, `new <name>`, `manage\|m` subcommands | PASS |
| CLI --version returns 0.1.0 | `node bin/clawd-linker.js --version` | `0.1.0` | PASS |
| fs.js exports all 11 functions | Module import check | All 11 functions present | PASS |
| config.js exports all 3 symbols | Module import check | `getRepoPath`, `setRepoPath`, `CONFIG_PATH` present and correct type | PASS |
| Service modules all importable | Module import check | `listPackages`, `readState/writeState/getInstalledPackages`, `installPackage/uninstallPackage` all `function` | PASS |
| Command modules all importable | Module import check | `initCommand`, `newCommand`, `manageCommand` all `function` | PASS |
| Only fs.js imports from fs/promises | grep scan | No other file in `src/` imports from `fs/promises` directly | PASS |
| walkFiles uses Node 20–24 compat | Source check | `e.parentPath ?? e.path` pattern present (fix from commit 02ac7d2) | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CFG-01 | 01-01 | Config stored at `~/.clawd-linker` | SATISFIED | `CONFIG_PATH = path.join(os.homedir(), '.clawd-linker')` |
| CFG-02 | 01-01 | Exits with actionable error on missing/invalid config | SATISFIED | `getRepoPath` has 3 exit paths with chalk.red messages |
| STATE-01 | 01-02 | data.json exists per package | SATISFIED | `newCommand` creates `data.json`; `readState` resilient if missing |
| STATE-02 | 01-02 | data.json tracks per-project symlink arrays | SATISFIED | `installedIn[projectPath] = ownedLinks` shape enforced |
| STATE-03 | 01-02 | Idempotent re-install is a no-op | SATISFIED | `readlink` comparison in `installPackage`; "No changes needed" in `manageCommand` |
| LINK-01 | 01-02 | Per-file symlinks (not per-directory) | SATISFIED | `walkFiles(pkg.filesPath)` returns individual files |
| LINK-02 | 01-02 | Absolute paths for source and target | SATISFIED | `path.resolve()` on both `source` and `target` |
| LINK-03 | 01-02 | Parent directories created as needed | SATISFIED | `mkdir(path.dirname(target), {recursive:true})` |
| LINK-04 | 01-02 | Uninstall removes only owned symlinks | SATISFIED | `uninstallPackage` reads `data.json`, removes only those paths |
| LINK-05 | 01-02 | Conflict detection and per-file prompt | SATISFIED | `conflictCallback(target)` called when real file exists; backup via `rename` |
| PKG-01 | 01-02/03 | Package scaffolded with files/, PACKAGE.md, data.json | SATISFIED | `newCommand` creates all three |
| PKG-02 | 01-02/03 | data.json gitignored per package | SATISFIED | `newCommand` writes `.gitignore` containing `data.json` |
| INIT-01 | 01-03 | init creates git-initialized repo and stores path | SATISFIED | `simpleGit().init()` + `setRepoPath()` |
| INIT-02 | 01-03 | Re-running init with valid config warns and exits | SATISFIED | Early return with `chalk.yellow` when config+repo both valid |
| MGR-01 | 01-03 | manage shows checkbox list of all packages | SATISFIED | `checkbox({choices: packages.map(...)})` |
| MGR-02 | 01-03 | Installed packages pre-checked in TUI | SATISFIED | `checked: installed.has(pkg.name)` |
| MGR-03 | 01-03 | Confirm selection installs/uninstalls diff | SATISFIED | `toInstall`/`toUninstall` diff drives `installPackage`/`uninstallPackage` |

All 17 requirements: SATISFIED (code-level evidence found)

### Anti-Patterns Found

No anti-patterns found. Scanned for: TODO/FIXME/PLACEHOLDER markers, `return null`/`return {}`/`return []` stubs, empty handlers, console.log-only implementations. No matches across any of the 9 source files.

### Human Verification Required

#### 1. Full End-to-End Lifecycle (7 Test Scenarios)

**Test:** Follow the 7-scenario sequence from `01-04-PLAN.md` in a real terminal session:
1. `clawd-linker init` — enter `/tmp/clawd-test-repo`
2. `clawd-linker init` again — expect yellow warning, no prompt
3. `clawd-linker new test-pkg` — inspect `/tmp/clawd-test-repo/test-pkg/{files/,PACKAGE.md,data.json,.gitignore}`
4. Add files to `files/`, run `clawd-linker manage` from `/tmp/clawd-test-project`, select `test-pkg`
5. Verify symlinks are absolute paths (`ls -la`) and parent dirs created
6. Re-run manage with same selection — expect "No changes needed."
7. Deselect `test-pkg` — verify symlinks removed, `data.json` emptied
8. Delete repo, run manage — expect red error with actionable message

**Expected:** All 8 steps produce the described output with zero errors.

**Why human:** The `@inquirer/prompts` checkbox/confirm TUI requires a TTY that cannot be driven programmatically. Symlink absoluteness, backup creation on conflict, and exact `data.json` state after each operation require live filesystem inspection. The 01-04-SUMMARY.md documents these scenarios passing on 2026-04-08, but this verifier cannot independently replay them.

### Gaps Summary

No gaps identified. All five roadmap success criteria are fully implemented and wired. The single human verification item concerns the interactive TUI which is not programmatically testable — not a gap in the implementation.

The one deviation from plans worth noting: `bin/clawd-linker.js` imports commands as `'../src/commands/init.js'` (extra `../src/` prefix) rather than `'./src/commands/init.js'`. This works correctly because the bin file is at `bin/clawd-linker.js` and navigates up one level to the project root, then into `src/`. Confirmed functional via `--help` and `--version` tests.

---

_Verified: 2026-04-08_
_Verifier: Claude (gsd-verifier)_
