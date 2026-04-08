# Domain Pitfalls

**Project:** clawd-linker
**Domain:** Node.js CLI symlink package manager
**Researched:** 2026-04-08
**Confidence:** MEDIUM — web tools unavailable; findings synthesized from training knowledge of GNU Stow, dotbot, chezmoi, mackup, yadm, and Node.js CLI ecosystem patterns. Core pitfalls are well-established and stable.

---

## Critical Pitfalls

Mistakes that cause data loss, silent failures, or rewrites.

---

### Pitfall 1: Treating data.json as the filesystem's source of truth — and trusting it blindly

**What goes wrong:** `data.json` records that a package is installed at `/path/to/project`. But the symlink may have been deleted manually, the project folder may have moved, or the symlink target may now point at a dead path (package repo moved or renamed). The tool reads `data.json`, concludes the package is installed, pre-checks the checkbox — and the user sees a false positive. They uncheck it, the tool tries to remove a symlink that doesn't exist, crashes or silently no-ops, and `data.json` is now permanently stale.

**Why it happens:** Trusting state storage without cross-validating against live filesystem state. This is the core design tension: `data.json` is cheap to read, `fs.lstat` on every recorded path is slower but correct.

**Consequences:**
- Users can't trust the checked/unchecked state of the package list
- Uninstall path tries to unlink non-existent paths and may throw
- Re-install path skips files because `data.json` says "already installed"
- State diverges permanently with no recovery path unless the user manually edits `data.json`

**Prevention:**
- On every `manage` invocation, for each path recorded in `data.json`, call `fs.lstat` (not `fs.existsSync`, which follows symlinks) and verify the inode is actually a symlink pointing into the package repo
- If the symlink is missing or points elsewhere: treat as "not installed", repair `data.json` before presenting the UI
- Use `fs.readlink` to verify the link target matches what clawd-linker would have created — not just that a symlink exists at that path

**Warning signs:**
- Checkbox state doesn't match what users see in the filesystem
- Uninstall operations silently succeed on files that don't exist
- `data.json` grows unboundedly (old project paths never pruned)

**Phase:** Address in Phase 1 (core symlink engine). The `manage` command's "installed" detection must be filesystem-verified, not storage-only.

---

### Pitfall 2: Symlink creation with relative vs. absolute paths — silent breakage when the repo moves

**What goes wrong:** `fs.symlink(target, path)` accepts both relative and absolute target paths. Relative paths are computed at creation time relative to the symlink's directory — not the tool's CWD. If the package repo is at `~/repos/clawd-packages/` and the project is at `~/dev/myproject/`, a relative symlink from the project file to the package file traverses `../../repos/clawd-packages/...`. If either directory moves (user reorganizes, external drive unmounts, repo cloned to different path), the symlink silently breaks — `ls -la` shows the link but reading it returns ENOENT.

**Why it happens:** Developers use absolute paths during development (both dirs are stable on their machine), ship with absolute paths, then discover the breakage only when the repo moves.

**Consequences:**
- All symlinks silently broken after repo relocation
- No error on `manage` — broken symlinks look like uninstalled packages
- Users lose access to shared files without any diagnostic message

**Prevention:**
- Use **absolute paths** for all symlink targets (resolved via `path.resolve` or `fs.realpath`)
- Store the resolved absolute package repo path in `~/.clawd-linker` at `init` time
- On startup, verify the stored repo path still resolves (call `fs.access`) before proceeding — fail loudly with a message like "Package repo not found at [path]. Run `clawd-linker init` to reconfigure."
- Document that moving the repo requires re-running `init` and re-linking all packages

**Warning signs:**
- Symlinks show as installed in `data.json` but files aren't accessible in projects
- `readlink` output contains `..` segments

**Phase:** Phase 1. Absolute path resolution must be the default and only strategy from day one.

---

### Pitfall 3: Directory-vs-file conflict when the target path is already a real directory

**What goes wrong:** A package's `files/` contains `.claude/` (a directory). The target project already has `.claude/` as a real directory with existing files. The tool tries to create a symlink at `.claude/` but a directory exists there — `fs.symlink` throws `EEXIST`. If the tool only handles the "regular file conflict" case (ask the user to overwrite or skip), it may crash or silently skip the entire package when encountering a directory collision.

The PROJECT.md says individual files are linked, not directories — but the implementation still needs to traverse the `files/` tree and handle the case where intermediate directories exist in the project as real dirs but don't exist yet in others.

**Why it happens:** Conflict detection is written for the common case (regular file exists), not for the directory case (directory exists where a symlink would go). Also, the distinction between "we need to create a parent directory" vs "a real directory already exists at the link target" is easy to conflate.

**Consequences:**
- Partial installs: some files linked, others silently skipped
- Crashes on `EEXIST` when target is a directory
- If directories are linked instead of individual files (a common early shortcut), two packages that share a directory (e.g., both put files in `.claude/commands/`) will conflict at the directory symlink level, making it impossible to install both

**Prevention:**
- Walk the `files/` tree recursively, linking individual files only (not directories)
- For each file in `files/`, create the parent directory in the project with `fs.mkdir(..., { recursive: true })` before creating the symlink
- Add a distinct conflict type: "target is a directory" — handle it by descending into the directory and linking individual files within it, rather than replacing the directory with a symlink
- Write a test with two packages that share a subdirectory (e.g., both have `files/.claude/commands/`) to catch this early

**Warning signs:**
- Any shortcut that links `files/` itself or a top-level directory inside it as a single symlink — this is the path to inter-package conflicts
- Missing `recursive: true` on `fs.mkdir` calls

**Phase:** Phase 1 (core engine). The decision to link individual files (already in PROJECT.md) must be implemented strictly; verify it with a two-package shared-directory test case.

---

### Pitfall 4: data.json written outside the unlink flow — orphaned records after failed removals

**What goes wrong:** Uninstall flow: (1) remove symlinks, (2) update `data.json`. If step 1 partially fails (one symlink throws, loop aborts), step 2 is never reached. `data.json` still lists the project path as installed. Next `manage` run shows the package as installed, user unchecks, tool tries to remove symlinks again — some already removed, some not — more partial failure.

The inverse also happens: step 2 runs but a write error leaves `data.json` truncated (zero bytes or malformed JSON). Now no packages are "installed" — the user's entire installed state is lost.

**Why it happens:** Not treating the symlink operation + state write as an atomic unit.

**Consequences:**
- State permanently diverges from filesystem
- Users can't reinstall packages because tool thinks they're installed
- JSON parse error on startup crashes the entire tool

**Prevention:**
- Always validate `data.json` exists and parses before any operation — treat parse failure as "empty state" with a warning, not a crash
- Write `data.json` atomically: write to `data.json.tmp`, then `fs.rename` (atomic on same filesystem)
- Reconcile `data.json` against filesystem at startup (see Pitfall 1) so stale records are pruned regardless of whether the write succeeded
- In the uninstall loop, collect errors per-file but continue the loop — then update `data.json` for the files that were successfully removed. Report the failures at the end.

**Warning signs:**
- Any `fs.writeFileSync(path, JSON.stringify(...))` without error handling
- JSON.parse called without try/catch on file content

**Phase:** Phase 1 (state management). Atomic writes and parse-resilient reads from the very first implementation.

---

### Pitfall 5: npx cache and stale binary — users running old tool versions without knowing

**What goes wrong:** `npx clawd-linker` caches the package after first run. If the user ran it 6 months ago, they're running the cached version — even after `npm publish` pushes bug fixes. npx behavior here is version-dependent and not always intuitive.

Additionally: `npx` in some Node.js versions resolves to the locally installed version if the package name matches a local `node_modules/.bin` entry. In a project that happens to have clawd-linker as a devDependency, the project-local version runs — not the global latest.

**Why it happens:** npx caching is designed for performance, but it works against tools that expect to always run the latest version.

**Consequences:**
- Bug fixes don't reach users automatically
- Version mismatch between the tool version and the schema version of `~/.clawd-linker` or `data.json` can corrupt state
- "It worked for me" debugging with outdated versions

**Prevention:**
- In `package.json`, add `engines: { node: ">=18" }` and verify this is enforced
- Add a `--version` flag and log the current version at startup in verbose mode
- If the config schema or `data.json` schema ever changes, add a `schemaVersion` field and migrate/error-out on mismatch
- Document in README: "use `npx clawd-linker@latest` to ensure latest version"
- Consider a lightweight version check (fetch `npm registry latest version`, compare, warn) but only as a future enhancement — not MVP

**Warning signs:**
- No `version` command or startup version log
- Config/state structures changing shape without a migration path

**Phase:** Phase 2 (polish/packaging). Not blocking for MVP, but schema versioning should be designed in from Phase 1 even if not enforced.

---

## Moderate Pitfalls

---

### Pitfall 6: Conflict prompt blocks — no batch mode for automation

**What goes wrong:** `manage` is interactive (checkbox list, per-conflict prompts). Fine for a human. But if someone scripts `clawd-linker manage` in a dotfiles bootstrap script, the process hangs waiting for stdin that never comes — or produces garbled output when stdout is piped.

**Prevention:**
- Detect non-TTY stdin (`process.stdin.isTTY === false`) and either fail with a clear message or accept a `--yes` / `--skip-conflicts` flag for non-interactive mode
- Separate the "resolve what should be installed" logic from the "prompt the user" logic so headless mode is easy to add later

**Phase:** Phase 2. Design the prompt/decision separation in Phase 1 to make this cheap to add.

---

### Pitfall 7: Silently following symlinks into the package repo during directory traversal

**What goes wrong:** `fs.readdir` with `withFileTypes: true` on the `files/` directory returns `Dirent` objects. If any entry inside `files/` is itself a symlink (perhaps the developer accidentally committed a symlink), calling `dirent.isDirectory()` returns `false` for a symlink-to-directory — but `fs.stat` (which follows links) says it's a directory. If the traversal uses `stat` instead of `lstat`, it will follow the symlink and recurse into it, potentially linking files from somewhere else entirely.

**Prevention:**
- Use `lstat` (not `stat`) during `files/` traversal to inspect entries without following symlinks
- Skip any entry in `files/` that is itself a symlink — log a warning
- Document that `files/` should only contain regular files and directories

**Phase:** Phase 1 (file walker implementation).

---

### Pitfall 8: Global config (~/.clawd-linker) format is a single path string — no room to grow

**What goes wrong:** `~/.clawd-linker` stores the repo path. If this is a raw string (not JSON), adding any second piece of global config (e.g., a default conflict resolution mode, a list of ignored packages) requires either a breaking format change or a parallel config file.

**Prevention:**
- Store `~/.clawd-linker` as JSON from day one: `{ "repoPath": "/path/to/repo", "schemaVersion": 1 }`
- Parse with try/catch and handle legacy plain-string format gracefully during any future migration

**Phase:** Phase 1 (init command).

---

### Pitfall 9: Symlinks from different packages collide at the same target path

**What goes wrong:** Package A has `files/Makefile`. Package B also has `files/Makefile`. User installs both. The second install overwrites the first symlink silently (or throws if conflict detection is in place). `data.json` now records both packages as "installed" for a Makefile that only one of them owns.

**Why it happens:** No ownership model for individual symlinks. The tool tracks which project has which package installed — but not which package owns which symlink in a project.

**Consequences:**
- Deinstalling package A removes the Makefile symlink, breaking package B's file
- Reinstalling package B re-creates the Makefile, but `data.json` shows A as installed

**Prevention:**
- Per-project state (either in `data.json` or a per-project `.clawd-linker.json`) should record not just "package X is installed here" but "package X owns symlink Y in this project"
- At install time, detect if a target path is already a symlink owned by another package and warn the user
- This is especially important for common files like `.gitignore`, `Makefile`, `.editorconfig`

**Warning signs:**
- Two packages in the same repo both have `files/` entries with the same relative path

**Phase:** Phase 1 design. The ownership model must be in `data.json` from the start; retrofitting it later requires migrating all existing state files.

---

### Pitfall 10: No cleanup of empty directories after uninstall

**What goes wrong:** Package installs `files/.claude/commands/my-command.md` — tool creates `.claude/commands/` directory and symlink. User uninstalls the package — tool removes the symlink. But `.claude/commands/` and `.claude/` are now empty directories left in the project. The user didn't have them before; now they're confused about why these empty dirs exist.

**Prevention:**
- After removing symlinks, walk up the directory tree from each removed symlink and remove empty directories (stop at the project root)
- Use `fs.rmdir` (not `fs.rm`) — it refuses to remove non-empty directories, making it safe

**Phase:** Phase 1 (uninstall flow).

---

## Minor Pitfalls

---

### Pitfall 11: Interactive checkbox library assumptions about terminal width

**What goes wrong:** Libraries like `inquirer` or `@clack/prompts` render checkbox lists based on terminal width. Very long package names, or terminals narrower than 80 columns, cause truncation or line-wrapping that makes the list unreadable. Package descriptions in `PACKAGE.md` being long enough to wrap mid-checkbox can break the selection UX.

**Prevention:**
- Keep package names short and meaningful (enforce in `new` command: warn if name > 30 chars)
- Test the UI at 80-column terminal width
- Choose a prompt library that handles terminal resize gracefully

**Phase:** Phase 1 (manage command UI).

---

### Pitfall 12: PACKAGE.md and data.json in the wrong location — included in symlinks

**What goes wrong:** If the package directory structure is:
```
my-package/
  PACKAGE.md
  data.json
  files/
    .some-config
```
And someone accidentally uses `my-package/` instead of `my-package/files/` as the root to walk, PACKAGE.md and data.json will get symlinked into projects. data.json being symlinked into a project is particularly dangerous — writing to it from one project affects all projects.

**Prevention:**
- The file walker must explicitly target only `packageDir/files/` — never the package root
- Add a check at startup: if `files/` does not exist inside a package dir, skip and warn — don't fall back to the package root

**Phase:** Phase 1 (package resolution logic).

---

### Pitfall 13: Clobbering real files when "overwrite" is confirmed — no backup

**What goes wrong:** User has a real `.gitignore` in their project. They confirm "overwrite" when prompted. The tool runs `fs.unlink` on the real file and creates a symlink. The original content is gone. The package's `.gitignore` may not have what the user needed.

**Prevention:**
- Before unlinking a real file on "overwrite", copy it to `[filename].clawd-backup` (or similar) and tell the user
- This is a one-liner addition that prevents irreversible data loss

**Phase:** Phase 1 (conflict resolution). Low-effort, high-value safety net.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| `init` command | Global config format too simple to extend | Store as JSON with `schemaVersion` from day one |
| `new` command | Package root walked instead of `files/` | Explicit `files/` targeting; guard if `files/` missing |
| Symlink creation | Relative paths break on repo move | Absolute paths only via `path.resolve` |
| Symlink creation | Directory conflict not handled | Descend into directories; link individual files only |
| Installed detection | `data.json` not reconciled with filesystem | Cross-validate with `fs.lstat` + `fs.readlink` on every `manage` run |
| State write | Non-atomic write corrupts `data.json` | Write to `.tmp`, then `fs.rename` |
| Uninstall | Empty parent directories left behind | Walk up and `fs.rmdir` empty dirs after unlinking |
| Uninstall | Ownership not tracked — deinstall breaks shared files | Record per-symlink ownership in state from day one |
| Conflict resolution | Real file overwritten without backup | Copy to `.clawd-backup` before unlinking |
| `manage` UI | Stale `data.json` shows wrong checked state | Filesystem-verify installed status before rendering UI |
| Packaging/npx | Users run stale cached version | Document `@latest`, add `schemaVersion` guard |

---

## Confidence Notes

- **HIGH confidence** (well-established, observed across multiple mature tools): Pitfalls 1, 2, 3, 4 (state/filesystem divergence, path handling, directory conflicts, non-atomic writes). These are the exact failure modes that drove design decisions in GNU Stow, dotbot, and chezmoi.
- **MEDIUM confidence** (strong reasoning, matches common Node.js CLI patterns): Pitfalls 5, 6, 7, 8, 9, 10, 11. Plausible from the design; standard avoidance patterns are well-known.
- **LOW confidence** (edge cases that depend on implementation specifics): None — all pitfalls above are grounded in the project's stated design.

Note: Web research tools were unavailable during this session. Findings are based on training knowledge of symlink management tools (GNU Stow, dotbot, chezmoi, mackup, yadm) and Node.js CLI development. The core pitfalls in this domain are stable and well-documented in the community; confidence is appropriate.

---

## Sources

- GNU Stow source and documentation (stow.gnu.org) — symlink conflict and folding/unfolding patterns
- dotbot (github.com/anishathalye/dotbot) — per-file conflict detection patterns
- chezmoi (chezmoi.io) — state reconciliation, atomic writes, template-based approach
- Node.js `fs` module documentation — `lstat` vs `stat` semantics, `symlink` target path resolution
- Training knowledge of npx caching behavior and Node.js CLI packaging conventions
