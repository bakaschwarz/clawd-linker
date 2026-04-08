# Feature Landscape

**Domain:** Symlink-based file/config package manager CLI (developer tool)
**Researched:** 2026-04-08
**Confidence:** MEDIUM — web tools unavailable; analysis drawn from deep training knowledge of GNU Stow, chezmoi, dotbot, yadm, rcm, mackup, homesick (all stable, mature tools with August 2025 cutoff)

---

## Reference Tools Analyzed

| Tool | Model | Core Mechanic |
|------|-------|---------------|
| GNU Stow | Package-per-directory, symlink farm | Symlink whole trees from stow dir into target |
| dotbot | YAML-config driven | Declarative link/shell/clean directives |
| chezmoi | Template + source-of-truth | Copy/template approach, not pure symlinks |
| yadm | Git overlay | git worktree trick for home dir dotfiles |
| rcm | Tag-based dotfiles | Tag directories select which files go where |
| mackup | App-specific backups | Moves app config to cloud storage, symlinks back |
| homesick | Castle-based (git repos) | Multiple castles (repos), `link` command symlinks all |
| fresh | Line-based file assembly | Assembles files from fragments across repos |

**clawd-linker's closest relatives:** GNU Stow (symlink-farm model) + homesick (git-repo-of-packages model) + an interactive TUI selection layer (unique).

---

## Table Stakes

Features users expect in any tool of this type. Missing = tool feels broken or unsafe.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Create symlinks | Core mechanic — without it there's no tool | Low | Must handle files AND directories; clawd-linker will link individual files |
| Remove symlinks cleanly | Install/uninstall cycle is fundamental | Low | Must only remove links it owns, never real files |
| Dry-run mode (`--dry-run` / `-n`) | Users need to preview before destructive ops | Low | Print what would happen without acting; considered essential by all major tools |
| Conflict detection | Real file at symlink target must not be silently overwritten | Low-Med | Stow, dotbot, chezmoi all surface conflicts before acting |
| Per-conflict resolution prompt | User must decide: skip, overwrite, or abort | Low | clawd-linker already scopes this correctly in PROJECT.md |
| List installed packages | "What's installed here?" is asked constantly | Low | Without this, state is opaque |
| Non-destructive unlink | Removing a package only removes its symlinks, never real content | Low | Critical trust property |
| Idempotent operations | Running install twice must not error or duplicate | Low | Stow, dotbot, chezmoi all guarantee idempotency |
| Init / bootstrap command | First-time setup must be guided | Low | `init` to create the repo structure |
| Global config storage | Where is my package repo? Must be findable from any project | Low | `~/.clawd-linker` pattern in PROJECT.md is the right call |
| Package scaffold command | Creating a new package must follow a consistent layout | Low | `new <name>` with `files/`, `PACKAGE.md`, `data.json` |
| Interactive package selection | Checkbox list is the primary UX surface | Med | This IS `clawd-linker manage`; must be fast and keyboard-friendly |
| State tracking (what's installed) | Knowing which packages are active per-project | Low-Med | `data.json` approach in PROJECT.md; all tools track this somehow |
| Help text for every command | Without `--help`, tool is unusable | Low | Standard CLI expectation |

---

## Differentiators

Features that set clawd-linker apart. Not universally expected, but provide real competitive edge over raw Stow or dotbot.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Interactive TUI checkbox selection | No other major tool offers this UX — Stow requires manual package names, dotbot requires editing YAML | Med | This is the core differentiator; makes the tool feel like a package manager not a config file |
| Pre-checked state reflects current install | Checkbox list starts with your current packages ticked — no mental bookkeeping | Low (once state tracking exists) | Requires `data.json` to be reliable; magnifies trust in state tracking |
| `npx`-zero-install UX | Works anywhere Node is installed, no global install, no shell bootstrapping | Low (infrastructure) | Chezmoi requires install; Stow requires Perl; dotbot requires Python; `npx` is frictionless for JS devs |
| Package-level README (`PACKAGE.md`) | Each package is self-documenting — what it does, what it installs | Low | No other tool formalizes this at the package level |
| `files/` mirrors project root | Mental model is immediately clear: what you see is what gets linked, where | Low (convention) | Stow uses the same model but doesn't enforce it with a named subdirectory |
| Per-package install metadata (`data.json`) | Explicit machine-local state enables reliable status reporting | Low-Med | Most tools infer state from the filesystem (fragile); explicit state is more trustworthy |
| Git-repo-as-package-store | Packages are naturally versioned and diffable via git | Low (just convention) | All content is committed; `data.json` is gitignored so repo is shareable |

---

## Anti-Features

Things to deliberately NOT build. Each has a reason grounded in the tool's scope.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Syncing project files back into packages | Breaks single-source-of-truth; creates merge conflicts and confusion | Packages are always the source; edit files in the repo, not the project |
| Template/variable substitution in files | chezmoi does this; adds a rendering layer that breaks "what you see is what you get" | Keep files as-is; if templating is needed, that's a package-level concern outside the tool |
| Remote package registries / package discovery | Scope explosion; authentication, versioning, CDN — far beyond a personal tool | Single local git repo; clone manually if you want someone else's packages |
| Multiple repo support per machine | Complicates global config, conflict resolution, and `manage` UX | One global repo per machine; enforce this constraint |
| Hooks / shell script execution on install | Security surface; dotbot has `shell` directives that are a footgun | Symlinks only; no arbitrary code execution |
| Package versioning / lockfiles | Overkill for a personal tool; git history is the version control | Use git tags/branches if pinning is needed; don't build semver machinery |
| GUI or web interface | Wrong medium for a CLI developer tool | CLI-only; TUI checkbox is as visual as this should get |
| Watch mode / live sync | Real-time symlink maintenance is complex and fragile on macOS (FSEvents, inotify) | On-demand `manage` runs are the right model |
| Cross-platform Windows support | Symlinks on Windows require admin rights or Developer Mode; fundamentally different | macOS-first as stated in PROJECT.md constraints; symlinks work correctly on Linux too as a bonus |
| Package dependency declarations | "Package A requires Package B" is dependency graph complexity | Keep packages flat and independent; no inter-package deps |
| Config file format (YAML/TOML) per project | dotbot's YAML config is its biggest friction point — you edit a file to change what's installed | `manage` TUI replaces config files entirely; state is in `data.json` |

---

## Feature Dependencies

```
init
  └── new <name>          (repo must exist before creating packages)
        └── manage        (packages must exist to select)
              └── install (select drives install/uninstall)
                    ├── conflict detection
                    │     └── per-conflict prompt
                    ├── create symlinks
                    └── remove symlinks

State tracking (data.json)
  └── pre-checked manage list  (installed state must be known before TUI renders)
  └── list installed            (display requires state)

dry-run flag
  └── wraps: install, uninstall, manage (all mutating operations)
```

---

## MVP Recommendation

These are the minimum features for the tool to be genuinely useful on day one:

**Must ship in MVP:**

1. `init` — create repo, write global config
2. `new <name>` — scaffold package structure
3. `manage` — interactive checkbox TUI with pre-checked state
4. Symlink creation (files from `files/` into project root)
5. Symlink removal (clean uninstall of deselected packages)
6. Conflict detection with per-file prompt (skip / overwrite)
7. Idempotency (re-running `manage` is safe)
8. `data.json` state tracking (gitignored per package)

**Defer without hurting MVP:**

- `--dry-run` flag — useful but not blocking; add in phase 2
- `list` command — useful for debugging; `manage` itself shows state
- Verbose/debug output — helpful for troubleshooting; add when bugs surface
- `--help` polish — basic help is enough for phase 1; improve iteratively

---

## Complexity Reference

| Complexity | Meaning |
|------------|---------|
| Low | 1-4 hours, well-understood pattern, no ambiguity |
| Med | 1-2 days, requires design decisions or library choices |
| High | 3+ days, external unknowns or significant state management |

---

## Sources

- GNU Stow manual and source behavior (training knowledge, HIGH confidence — stable since 2015)
- dotbot README and directive model (training knowledge, HIGH confidence — stable API)
- chezmoi documentation and user guide (training knowledge, HIGH confidence — mature tool)
- homesick gem behavior (training knowledge, MEDIUM confidence)
- rcm (thoughtbot) documentation (training knowledge, MEDIUM confidence)
- clawd-linker PROJECT.md (direct source, HIGH confidence)
- General symlink behavior on macOS/Linux POSIX (HIGH confidence — OS fundamentals)

**Note:** WebSearch and WebFetch tools returned API errors during this research session. All findings are from training data (cutoff August 2025). The tools analyzed (Stow, chezmoi, dotbot) are mature with stable feature sets — confidence in the feature landscape is MEDIUM-HIGH. Verify any specific version-dependent claims against current docs before finalizing the roadmap.
