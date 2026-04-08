# clawd-linker

## What This Is

A Node.js CLI tool that manages reusable file packages across multiple projects via symlinks. Packages live in a central git repository; `clawd-linker` lets you select which packages to install in a project and handles creating and removing the symlinks automatically.

## Core Value

A developer can run `npx clawd-linker manage` in any project and instantly sync the right set of shared files — no manual copying, no drift.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] `npx clawd-linker init` creates a new package repository (git-initialized folder) and stores its path in a global config at `~/.clawd-linker`
- [ ] `npx clawd-linker new <name>` scaffolds a new package inside the repo (`files/`, `PACKAGE.md`, `data.json`)
- [ ] `npx clawd-linker manage` (alias: `m`) presents an interactive checkbox list of all packages, pre-checked for those already installed in the current project
- [ ] After confirming the selection, symlinks are created from each file/folder inside a package's `files/` directory into the corresponding location in the project root (files/ treated as project root)
- [ ] Deselected packages have their symlinks removed from the project
- [ ] `data.json` inside each package tracks which project paths have that package installed; it is not committed to git (`.gitignore`d per package)
- [ ] Installed status is determined by checking `data.json` (source of truth)
- [ ] When a symlink target already exists as a real file, the user is prompted per-conflict to overwrite or skip

### Out of Scope

- Syncing in the other direction (project files back into package) — packages are the source of truth
- Package versioning / multiple repos — single global repo per machine for now
- Remote package registries — local git repo only

## Context

- This is a personal developer tool for Yannick
- The use case is sharing configuration files, scripts, and templates (e.g. `.claude/commands/`, dotfiles, tooling configs) across multiple projects without duplicating them
- Packages are organized as named folders in the root of a single git repository
- `files/` within each package is the content to be linked; its structure mirrors the target project root
- `data.json` holds local machine state (installation paths) — not meant to be committed

## Constraints

- **Runtime**: Node.js — must work via `npx` without a global install
- **Platform**: macOS-first (symlinks assumed available)
- **Scope**: Personal tool — no auth, no server, no multi-user scenarios

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Symlink individual files (not directories) | Avoids conflicts when multiple packages contribute to the same directory | — Pending |
| Global config at `~/.clawd-linker` | Single consistent lookup point across all projects | — Pending |
| data.json gitignored per package | Installation paths are machine-local, not shareable | — Pending |
| Installed check via data.json | Predictable source of truth; doesn't depend on filesystem state | — Pending |
| Conflict resolution: ask per-file | Safer default; user keeps control | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-08 after initialization*
