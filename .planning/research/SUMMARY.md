# Project Research Summary

**Project:** clawd-linker
**Domain:** Node.js CLI symlink package manager (developer tool)
**Researched:** 2026-04-08
**Confidence:** HIGH (stack), MEDIUM-HIGH (features/pitfalls), HIGH (architecture)

## Executive Summary

clawd-linker is a personal developer tool in the tradition of GNU Stow and homesick: a symlink farm manager where a local git repo of "packages" gets linked into project directories on demand. The core differentiator is a TUI checkbox interface that replaces manual config files or command-line package names — users see all packages, check the ones they want, and the tool reconciles the delta. This UX does not exist in any major tool in this space (Stow, dotbot, chezmoi all require editing files or typing package names). The `npx` zero-install distribution model is a second differentiator: it works anywhere Node >= 20 is installed with no global install or shell bootstrapping.

The recommended approach is: plain ESM JavaScript (no TypeScript build step), `commander` for CLI routing, `@inquirer/prompts` for the checkbox TUI, `conf` for global config, `simple-git` for repo initialization, `chalk` for terminal output, and `vitest` for testing. The architecture follows a strict layering model — thin commands that own only UX, fat services that own filesystem logic, and a single `fs-utils.js` boundary for all `fs/promises` calls. This is a well-understood, low-ambiguity project where the main risks are not technical complexity but correctness of the symlink state machine.

The dominant risk category is state divergence: `data.json` recording packages as installed when symlinks have been manually removed, broken by repo relocation, or partially failed during uninstall. Every pitfall in this domain traces back to the same root: trusting stored state without cross-validating against the live filesystem. Mitigation is consistent — verify with `fs.lstat` + `fs.readlink` at runtime, write state atomically (write-to-tmp then `fs.rename`), and record per-symlink ownership in `data.json` from day one so the ownership model never needs a breaking migration.

---

## Key Findings

### Recommended Stack

The stack is fully resolved with HIGH confidence. All libraries are ESM-only in their current major versions, which drives the `"type": "module"` requirement and Node >= 20.12.0 floor. No build step is needed — `npx` runs the package directly from `bin/clawd-linker.js` with a shebang. This is the correct choice for a personal tool: shipping a `dist/` or requiring callers to have `tsx` on PATH would add unnecessary friction.

**Core technologies:**
- `commander@^14.0.3`: CLI routing for 3 subcommands — dominant Node.js CLI framework (316M weekly downloads), zero config for this scope
- `@inquirer/prompts@^8.4.1`: All interactive prompts (checkbox, confirm, input) — official successor to legacy `inquirer`, only scoped package with a working multi-select checkbox
- `conf@^15.1.0`: Global config at `~/.clawd-linker` — atomic writes, XDG-aware, ESM-native; plain `fs` + JSON is a valid fallback if ESM interop causes friction
- `simple-git@^3.35.2`: `git init` for new package repos — structured error handling over raw `execFile`; consider dropping to `execa('git', ['init'])` if git surface stays minimal
- `chalk@^5.6.2`: Terminal output color — 374M downloads/week, ESM-only at v5
- `vitest@^4.1.3`: Test runner — zero-config ESM support; Jest requires `--experimental-vm-modules` for ESM which adds friction
- `fs/promises` (built-in): All symlink, readdir, mkdir, lstat operations — Node 20 covers everything; no `fs-extra` or `glob` needed

### Expected Features

clawd-linker's feature set is well-defined against mature reference tools. The closest relatives are GNU Stow (symlink-farm model) and homesick (git-repo-of-packages) plus an interactive TUI selection layer that no existing tool offers.

**Must have (table stakes) — MVP blockers:**
- `init` command — create repo structure, write `~/.clawd-linker` global config
- `new <name>` command — scaffold `files/`, `PACKAGE.md`, `data.json` with consistent layout
- `manage` command — interactive checkbox TUI with pre-checked state reflecting current installs
- Symlink creation (individual files from `files/` into project root — never directories)
- Symlink removal (clean uninstall of deselected packages)
- Conflict detection with per-file prompt (skip or overwrite, with backup of real files before overwrite)
- Idempotency — re-running `manage` is always safe
- `data.json` state tracking per package (gitignored, records which projects have the package installed)
- `--help` for every command

**Should have (competitive differentiators):**
- Pre-checked TUI state reflecting live filesystem-verified installs (not just `data.json` — cross-validated)
- Per-symlink ownership tracking in `data.json` (which package owns which symlink in a given project)
- Empty directory cleanup after uninstall
- Startup validation that the configured repo path still exists (fail loudly if not)

**Defer (v2+):**
- `--dry-run` flag — useful but `manage` already shows the selection diff before acting
- `list` command — the `manage` checkbox view already surfaces installed state
- Non-TTY / `--yes` batch mode for scripted installs
- Version check against npm registry (lightweight "new version available" warning)
- Verbose/debug output

**Anti-features (do not build):**
- Template/variable substitution in files — breaks the "what you see is what you get" mental model
- Multiple repo support per machine — complicates global config and manage UX
- Hooks / shell script execution on install — security footgun
- Watch mode / live sync — complex and fragile on macOS
- Cross-platform Windows support — symlinks require admin/Developer Mode on Windows

### Architecture Approach

The architecture follows a strict 4-layer model that maps directly to the build order. Thin commands own prompts and output formatting; fat services own all business logic and filesystem mutations; `fs-utils.js` is the single seam for all `fs/promises` calls (no other file imports `fs`); the bin entry is pure wiring. This separation makes every service unit-testable with mocked fs calls.

**Major components:**
1. `bin/clawd-linker.js` — shebang entry, `commander` routing, no logic
2. `src/commands/{init,new,manage}.js` — orchestrate user intent; own UX flow and prompts
3. `src/config.js` — read/write `~/.clawd-linker` as JSON (`{ repoPath, schemaVersion }`)
4. `src/services/package-registry.js` — enumerate packages in repo; return typed descriptor objects
5. `src/services/symlink-manager.js` — create/remove symlinks; detect conflicts; create parent dirs
6. `src/services/package-state.js` — read/write `data.json`; reconcile against filesystem
7. `src/utils/fs.js` — the only file that imports `fs/promises`

**Build order dictated by dependency graph:** `fs-utils` → `config` + `package-registry` + `package-state` → `symlink-manager` → commands → bin entry.

### Critical Pitfalls

All 4 critical pitfalls are Phase 1 concerns — they must be designed correctly from the first implementation, not retrofitted.

1. **Stale `data.json` showing false install state** — on every `manage` run, cross-validate each recorded path with `fs.lstat` + `fs.readlink` to verify the symlink exists and points into the package repo. Treat mismatches as "not installed" and repair `data.json` before rendering the TUI.

2. **Relative symlink paths breaking on repo relocation** — use absolute paths exclusively (`path.resolve` at creation time); verify the repo path via `fs.access` on startup and fail loudly if missing; document that moving the repo requires re-running `init`.

3. **Directory-vs-file conflict crashes** — walk `files/` recursively linking individual files only (never directories); create parent directories in the project with `fs.mkdir({ recursive: true })` before each symlink; distinguish "target is a real directory" from "target is a regular file" in conflict handling.

4. **Non-atomic `data.json` writes causing corruption** — always write to `data.json.tmp` then `fs.rename` (atomic on same filesystem); parse `data.json` with try/catch and treat parse failure as empty state with a warning, never a crash; continue the uninstall loop on per-file errors, update state only for files that succeeded.

5. **Per-symlink ownership not tracked — deinstall breaks shared files** — `data.json` must record not just "package X is installed in project Y" but which symlinks package X owns in project Y. Two packages sharing a target path (e.g., both have `files/Makefile`) must be detected at install time. This data model cannot be retrofitted without a migration.

---

## Implications for Roadmap

### Phase 1: Core Symlink Engine + All Three Commands

**Rationale:** The architecture's build order is unambiguous — foundational layers must precede commands. All 4 critical pitfalls are Phase 1 concerns. The MVP is not useful until all three commands exist and the symlink state machine is correct. Splitting into "foundation then commands" would leave nothing runnable at the end of Phase 1.

**Delivers:** A fully functional `clawd-linker` that can `init` a repo, scaffold packages with `new`, and manage installs interactively via `manage` with correct conflict detection and idempotent state.

**Addresses:** All 8 MVP must-have features from FEATURES.md.

**Implements:**
- `fs-utils.js` (Layer 0)
- `config.js`, `package-registry.js`, `package-state.js` (Layer 1)
- `symlink-manager.js` (Layer 2)
- All three commands + bin entry (Layers 3-4)

**Avoids (must get right):**
- Pitfall 1: filesystem-verify installed state before rendering TUI
- Pitfall 2: absolute paths only, startup repo validation
- Pitfall 3: individual file linking, parent dir creation, directory conflict handling
- Pitfall 4: atomic `data.json` writes, parse-resilient reads
- Pitfall 5 (ownership): per-symlink ownership model in `data.json` from day one
- Pitfall 12: walk only `files/` subdirectory, never package root
- Pitfall 13: copy real files to `.clawd-backup` before overwriting on conflict

### Phase 2: Robustness + Polish

**Rationale:** After Phase 1 delivers a working tool, these additions improve reliability and UX without blocking core functionality.

**Delivers:** A tool that handles edge cases gracefully, supports scripted use, and is safe to publish.

**Implements:**
- Empty directory cleanup after uninstall (Pitfall 10)
- Non-TTY detection + `--skip-conflicts` / `--yes` flag for headless mode (Pitfall 6)
- `--dry-run` flag wrapping all mutating operations
- `--version` flag and schema versioning in `~/.clawd-linker` and `data.json` (Pitfall 5/8)
- `list` command for status inspection without opening manage TUI
- `lstat`-based file walker in `files/` (Pitfall 7: skip symlinks inside files/)
- Package name length warning in `new` command (Pitfall 11: terminal width)

**Uses:** No new dependencies — all built on Phase 1 infrastructure.

### Phase 3: Testing + Distribution

**Rationale:** Vitest integration tests covering the critical correctness properties of the symlink engine. Publishing to npm for `npx` consumption.

**Delivers:** A published, tested package usable via `npx clawd-linker`.

**Implements:**
- Unit tests for `symlink-manager`, `package-state`, `package-registry` with mocked `fs-utils`
- Integration test: two packages sharing a subdirectory (catches Pitfall 3 regressions)
- Integration test: stale `data.json` reconciliation (catches Pitfall 1 regressions)
- `npm publish` with correct `files`, `bin`, `engines` fields in `package.json`
- README with `npx clawd-linker@latest` usage note (Pitfall 5)

### Phase Ordering Rationale

- Phase 1 must deliver all three commands because none is useful alone — `init` without `new` without `manage` is not a complete tool.
- All critical pitfalls (1–4) are Phase 1 concerns because they involve data model decisions (`data.json` ownership schema, atomic writes, absolute paths) that cannot be safely retrofitted.
- Phase 2 is deliberately deferred: `--dry-run`, `list`, and headless mode are not blocking for personal use but are important for trust and scriptability.
- Phase 3 is last because test coverage is most valuable once the design is stable — writing tests against a moving architecture is waste.

### Research Flags

Phases with standard patterns (skip `/gsd-research-phase`):
- **Phase 1:** All patterns are well-documented (Node.js fs/promises, commander, @inquirer/prompts, symlink semantics). No external APIs, no novel integrations.
- **Phase 2:** Same stack; patterns for `--dry-run` and non-TTY detection are standard CLI conventions.
- **Phase 3:** vitest patterns are well-documented; npm publish workflow is standard.

No phase requires deeper research — this is a well-charted domain.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All library versions verified via npm registry on 2026-04-08; engine requirements verified with `npm view`; Node.js fs/promises coverage verified against Node 24 |
| Features | MEDIUM-HIGH | Web tools unavailable; analysis from training knowledge of GNU Stow, dotbot, chezmoi (all mature, stable tools). Feature landscape is stable. Specific version-dependent claims should be verified against current docs. |
| Architecture | HIGH | Well-established Node.js CLI layering patterns; component boundaries directly derived from the project's own data model (PROJECT.md). No novel patterns. |
| Pitfalls | HIGH (critical), MEDIUM (moderate/minor) | Critical pitfalls (1–4) are exactly the failure modes observed across GNU Stow, dotbot, and chezmoi — HIGH confidence. Moderate/minor pitfalls are well-reasoned from the design but unverified against real user reports. |

**Overall confidence:** HIGH

### Gaps to Address

- **`conf` vs plain `fs` for global config:** Both are valid. `conf` is recommended but if ESM interop causes friction during implementation, switch to plain `fs.readFile`/`fs.writeFile` + `JSON.parse`. Decide at implementation time, not before.
- **`simple-git` vs `execa('git', ['init'])`:** If git surface stays at one command (`git init`), drop `simple-git` and use `execa` directly. Evaluate after Phase 1 scoping.
- **FEATURES.md sourced from training knowledge:** The reference tools (Stow, dotbot, chezmoi) are mature and stable, but verify any specific behavior claims before using them to justify design decisions in planning.

---

## Sources

### Primary (HIGH confidence)
- npm registry API — library versions, weekly download counts, engine requirements (verified 2026-04-08)
- Node.js `fs/promises` documentation — symlink, lstat, readdir, mkdir API coverage (verified against Node 24.14.0)
- Commander.js established CLI routing patterns (316M weekly downloads; well-documented)
- POSIX symlink semantics on macOS/Linux (OS fundamentals)

### Secondary (MEDIUM confidence)
- GNU Stow manual and source behavior — symlink-farm model, conflict detection patterns
- dotbot README and directive model — per-file conflict handling, idempotency guarantees
- chezmoi documentation — state reconciliation, atomic writes approach
- homesick gem — castle-based git repo model
- clawd-linker PROJECT.md — direct source for scope constraints

### Tertiary (training knowledge)
- npx caching behavior — version-dependent; document `@latest` usage, verify against current Node.js docs before finalizing README guidance
- `@inquirer/prompts` checkbox feature set — verified via npm package keywords/description; test in a real terminal before shipping

---

*Research completed: 2026-04-08*
*Ready for roadmap: yes*
