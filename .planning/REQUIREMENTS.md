# Requirements: clawd-linker

**Defined:** 2026-04-08
**Core Value:** A developer can run `npx clawd-linker manage` in any project and instantly sync the right set of shared files — no manual copying, no drift.

## v1 Requirements

### Init (INIT)

- [ ] **INIT-01**: User can run `npx clawd-linker init` to create a git-initialized package repository at a specified path and store its location in `~/.clawd-linker`
- [ ] **INIT-02**: If `~/.clawd-linker` already points to a valid repo, `init` warns the user and exits cleanly without overwriting

### Package Scaffolding (PKG)

- [ ] **PKG-01**: User can run `npx clawd-linker new <name>` to scaffold a new package inside the repo (`<name>/files/`, `<name>/PACKAGE.md`, `<name>/data.json`)
- [ ] **PKG-02**: Newly scaffolded packages have `data.json` gitignored via a per-package `.gitignore`

### Manage TUI (MGR)

- [ ] **MGR-01**: User can run `npx clawd-linker manage` (alias: `m`) from any project directory to open an interactive checkbox list of all available packages
- [ ] **MGR-02**: Packages already installed in the current project are pre-checked in the TUI
- [ ] **MGR-03**: After the user confirms their selection, selected packages are installed and deselected packages are uninstalled

### Symlink Engine (LINK)

- [ ] **LINK-01**: Installing a package creates individual file symlinks for every file inside `files/`, mapping each to its corresponding path in the project root (`files/` is treated as the project root)
- [ ] **LINK-02**: All created symlinks use absolute paths (not relative)
- [ ] **LINK-03**: Parent directories are created in the project as needed before symlinking
- [ ] **LINK-04**: Uninstalling a package removes exactly the symlinks that package owns in the project
- [ ] **LINK-05**: When a real file already exists at a symlink target path, the user is prompted per-conflict to skip or overwrite

### State Tracking (STATE)

- [ ] **STATE-01**: Each package's `data.json` records which project paths have that package installed
- [ ] **STATE-02**: `data.json` records per-symlink ownership — which specific files each package owns in each project (not just a boolean "installed" flag)
- [ ] **STATE-03**: Running `manage` with the same selection twice is a no-op (idempotent)

### Global Config (CFG)

- [ ] **CFG-01**: `~/.clawd-linker` stores the package repository path as the global config
- [ ] **CFG-02**: If the configured repo path does not exist at startup, the tool exits with a clear, actionable error message

## v2 Requirements

### Robustness

- **ROB-01**: `--dry-run` flag shows what would be symlinked/removed without making changes
- **ROB-02**: Empty directories left behind after uninstall are cleaned up automatically
- **ROB-03**: Live filesystem cross-validation — on `manage` startup, verify each `data.json` entry against actual symlinks (`lstat` + `readlink`) and auto-repair stale state

### UX Polish

- **UX-01**: `npx clawd-linker list` command shows installed packages for the current project without opening the TUI
- **UX-02**: Non-TTY / `--yes` mode for scripted/headless installs
- **UX-03**: Schema version field in `~/.clawd-linker` and `data.json` for future migration support

## Out of Scope

| Feature | Reason |
|---------|--------|
| Reverse sync (project → package) | Packages are the source of truth; reverse sync creates ambiguity |
| Multiple repos per machine | Complicates global config and manage UX; single repo is sufficient |
| Remote package registries | This is a local-first personal tool |
| Template/variable substitution in files | Breaks "what you see is what you get"; security footgun |
| Shell hook execution on install | Security footgun; out of scope for a symlink manager |
| Windows support | Symlinks require admin/Developer Mode on Windows; macOS-first |
| Watch mode / live sync | Complex and fragile; manage-on-demand is sufficient |

## Traceability

*(Updated during roadmap creation)*

| Requirement | Phase | Status |
|-------------|-------|--------|
| INIT-01 | — | Pending |
| INIT-02 | — | Pending |
| PKG-01 | — | Pending |
| PKG-02 | — | Pending |
| MGR-01 | — | Pending |
| MGR-02 | — | Pending |
| MGR-03 | — | Pending |
| LINK-01 | — | Pending |
| LINK-02 | — | Pending |
| LINK-03 | — | Pending |
| LINK-04 | — | Pending |
| LINK-05 | — | Pending |
| STATE-01 | — | Pending |
| STATE-02 | — | Pending |
| STATE-03 | — | Pending |
| CFG-01 | — | Pending |
| CFG-02 | — | Pending |

**Coverage:**
- v1 requirements: 17 total
- Mapped to phases: 0 (pending roadmap)
- Unmapped: 17 ⚠️

---
*Requirements defined: 2026-04-08*
*Last updated: 2026-04-08 after initial definition*
