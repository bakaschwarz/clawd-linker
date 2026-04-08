# Roadmap: clawd-linker

## Overview

clawd-linker is a personal symlink manager with a single delivery arc: build the complete working tool, then harden it for edge cases, then test and publish it. All three commands (`init`, `new`, `manage`) are required for any value — a partial implementation of the tool is no implementation at all. Phase 1 delivers the entire functional core. Phase 2 adds robustness and UX polish that are not blocking for personal use. Phase 3 covers test coverage and npm publication.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Core Symlink Engine** - All three commands working end-to-end with correct state tracking
- [ ] **Phase 2: Robustness + Polish** - Edge case handling, dry-run, headless mode, and UX improvements
- [ ] **Phase 3: Testing + Distribution** - Test suite covering critical correctness properties; published to npm

## Phase Details

### Phase 1: Core Symlink Engine
**Goal**: A developer can run all three commands — `init`, `new`, and `manage` — to create a package repo, scaffold packages, and manage symlinks across projects with correct state tracking and conflict handling
**Depends on**: Nothing (first phase)
**Requirements**: INIT-01, INIT-02, PKG-01, PKG-02, MGR-01, MGR-02, MGR-03, LINK-01, LINK-02, LINK-03, LINK-04, LINK-05, STATE-01, STATE-02, STATE-03, CFG-01, CFG-02
**Success Criteria** (what must be TRUE):
  1. User can run `npx clawd-linker init` to create a git-initialized package repo and have its path stored at `~/.clawd-linker`; re-running init with a valid config warns and exits cleanly
  2. User can run `npx clawd-linker new <name>` to scaffold a package directory with `files/`, `PACKAGE.md`, and a gitignored `data.json`
  3. User can run `npx clawd-linker manage` from a project directory, see all packages with installed ones pre-checked, confirm a selection, and have the correct symlinks created or removed
  4. Symlinks are created per-file (not per-directory), use absolute paths, create parent directories as needed, and are removed cleanly on uninstall
  5. Running `manage` twice with the same selection is a no-op; when a real file exists at a symlink target the user is prompted per-conflict to skip or overwrite
**Plans:** 4 plans
Plans:
- [x] 01-01-PLAN.md — Project scaffold, fs-utils boundary module, and global config
- [x] 01-02-PLAN.md — Core services: package-registry, package-state, symlink-manager
- [x] 01-03-PLAN.md — CLI commands (init, new, manage) and commander wiring
- [x] 01-04-PLAN.md — End-to-end verification checkpoint

### Phase 2: Robustness + Polish
**Goal**: The tool handles edge cases gracefully, supports scripted use, and cleans up after itself
**Depends on**: Phase 1
**Requirements**: (v2 — ROB-01, ROB-02, ROB-03, UX-01, UX-02, UX-03)
**Success Criteria** (what must be TRUE):
  1. User can pass `--dry-run` to see what would be symlinked or removed without any filesystem changes
  2. Empty directories left behind after uninstall are automatically removed
  3. On `manage` startup, stale `data.json` entries are cross-validated against the live filesystem and auto-repaired before the TUI renders
  4. User can run `npx clawd-linker list` to see installed packages without opening the TUI
  5. Tool runs non-interactively (via `--yes` flag or non-TTY detection) for scripted use
**Plans**: TBD

### Phase 3: Testing + Distribution
**Goal**: The tool is tested against its critical correctness properties and published to npm for `npx` consumption
**Depends on**: Phase 2
**Requirements**: (no formal v1/v2 requirements — implementation quality + publish)
**Success Criteria** (what must be TRUE):
  1. Unit tests cover `symlink-manager`, `package-state`, and `package-registry` with mocked fs calls
  2. Integration tests cover: two packages sharing a subdirectory; stale `data.json` reconciliation; idempotent re-run of `manage`
  3. `npx clawd-linker@latest` works on a clean machine with Node >= 20 installed
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Core Symlink Engine | 0/4 | Planned | - |
| 2. Robustness + Polish | 0/? | Not started | - |
| 3. Testing + Distribution | 0/? | Not started | - |
