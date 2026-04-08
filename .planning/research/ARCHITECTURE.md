# Architecture Patterns

**Project:** clawd-linker
**Domain:** Node.js CLI symlink package manager
**Researched:** 2026-04-08
**Confidence:** HIGH (well-established Node.js CLI patterns)

---

## Recommended Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         CLI Entry                           │
│  bin/clawd-linker.js  (shebang, argument routing via yargs  │
│  or commander)                                              │
└─────────────────┬───────────────────────────────────────────┘
                  │ dispatches to
        ┌─────────┴──────────────────────────┐
        │                                    │
        ▼                                    ▼
┌───────────────┐                   ┌────────────────┐
│  Commands     │                   │   Config       │
│  init.js      │                   │   Layer        │
│  new.js       │◄──reads/writes───►│  global-config │
│  manage.js    │                   │  .js           │
└───────┬───────┘                   └────────────────┘
        │ calls                             ▲
        ▼                                   │ reads
┌────────────────────────────────────────────────────────────┐
│                     Service Layer                          │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │  Package     │  │  Symlink     │  │  PackageState   │  │
│  │  Registry    │  │  Manager     │  │  (data.json)    │  │
│  │  service.js  │  │  service.js  │  │  service.js     │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬────────┘  │
└─────────┼─────────────────┼───────────────────┼────────────┘
          │                 │                   │
          └────────────────►└───────────────────┘
                            │ all use
                            ▼
                   ┌────────────────┐
                   │   fs-utils.js  │
                   │  (low-level    │
                   │  filesystem    │
                   │  primitives)   │
                   └────────────────┘
```

---

## Component Boundaries

| Component | Responsibility | Input | Output | Communicates With |
|-----------|---------------|-------|--------|-------------------|
| **CLI Entry** (`bin/clawd-linker.js`) | Parse argv, route to command, set up process | `process.argv` | Exit code | Commands |
| **Commands** (`src/commands/`) | Orchestrate user intent; own the UX flow | Parsed args + user prompts | Side effects | Config Layer, Service Layer, `inquirer` for prompts |
| **Config Layer** (`src/config.js`) | Read/write `~/.clawd-linker` global config | Filesystem | Config object | fs-utils |
| **Package Registry** (`src/services/package-registry.js`) | Enumerate packages in repo; read `PACKAGE.md` metadata | Repo path from config | List of package descriptors | Config Layer, fs-utils |
| **Symlink Manager** (`src/services/symlink-manager.js`) | Create/remove symlinks; detect conflicts | Package path, project path, file list | Success/conflict results | fs-utils |
| **Package State** (`src/services/package-state.js`) | Read/write `data.json` per package | Package path | Installed projects list | fs-utils |
| **fs-utils** (`src/utils/fs.js`) | Low-level: `fs.symlink`, `fs.unlink`, `lstat`, `readdir`, path resolution | Raw paths | Node.js fs results | Node.js `fs/promises` only |

---

## Data Flow

### `clawd-linker init`

```
CLI Entry
  → init command
    → prompt: where to create/register the repo?
    → Config Layer: write { repoPath } to ~/.clawd-linker
    → fs-utils: mkdir repo, create files/ stub if needed
```

### `clawd-linker new <name>`

```
CLI Entry
  → new command
    → Config Layer: read repoPath
    → fs-utils: mkdir <repoPath>/<name>/files/
    → fs-utils: write <repoPath>/<name>/PACKAGE.md (template)
    → fs-utils: write <repoPath>/<name>/data.json ({ installedIn: [] })
    → fs-utils: write <repoPath>/.gitignore (append **/data.json)
```

### `clawd-linker manage`

```
CLI Entry
  → manage command
    → Config Layer: read repoPath
    → Package Registry: list all packages (readdir repoPath)
    → Package State: for each package, check data.json for cwd
      → returns: Set<packageName> currently installed here
    → inquirer: checkbox prompt (all packages; pre-check installed set)
    → diff: compute toInstall[], toRemove[]

    For each package in toInstall[]:
      → Package Registry: resolve files list (readdir <pkg>/files/ recursively)
      → Symlink Manager: for each file:
          → fs-utils: lstat target path
          → if exists and not symlink → prompt user: overwrite or skip?
          → if skip → continue
          → if overwrite or not exists → fs-utils: symlink(source, target)
      → Package State: update data.json (add cwd to installedIn)

    For each package in toRemove[]:
      → Package Registry: resolve files list
      → Symlink Manager: for each file:
          → fs-utils: lstat target — confirm it IS a symlink before unlinking
          → fs-utils: unlink(target)
      → Package State: update data.json (remove cwd from installedIn)
```

---

## Patterns to Follow

### Pattern 1: Thin Commands, Fat Services

Commands own user interaction (prompts, output formatting, exit codes). Services own business logic (filesystem operations, state mutations). Commands never touch `fs` directly.

**Why:** Commands are hard to unit test when they mix IO with logic. Services can be tested with mocked fs.

```javascript
// GOOD: command delegates to service
async function manageCommand(args) {
  const repo = await config.getRepoPath();
  const packages = await packageRegistry.list(repo);
  const installed = await packageState.getInstalledPackages(repo, process.cwd());
  const selected = await prompt(packages, installed);   // inquirer here
  await symlinkManager.apply({ toInstall, toRemove });  // logic in service
}
```

### Pattern 2: fs-utils as the Only fs Boundary

All `fs/promises` calls go through `src/utils/fs.js`. No other file imports `fs` directly. This gives a single seam for testing and error handling.

```javascript
// src/utils/fs.js — the only place that imports fs
import { symlink, unlink, lstat, readdir, mkdir, writeFile } from 'fs/promises';
```

### Pattern 3: Config as a Simple JSON File

`~/.clawd-linker` is a flat JSON file. Config Layer exposes `get()` and `set()` only. No abstraction needed beyond that for a personal tool.

```javascript
// ~/.clawd-linker content
{ "repoPath": "/Users/yannick/my-packages" }
```

### Pattern 4: Package Descriptor Object

The Package Registry returns a consistent shape. All services consume this; nothing parses raw paths downstream.

```javascript
{
  name: "my-claude-commands",
  path: "/Users/yannick/my-packages/my-claude-commands",
  filesPath: "/Users/yannick/my-packages/my-claude-commands/files",
  dataJsonPath: "/Users/yannick/my-packages/my-claude-commands/data.json"
}
```

### Pattern 5: ESM-first with `"type": "module"` in package.json

Node.js 18+ supports ESM natively. Prefer `import/export` over `require`. The `bin` entry uses `.js` with `#!/usr/bin/env node` shebang. No build step needed for a CLI this size.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Global State / Singleton Config

**What:** Importing config at module load time and caching it in a module-level variable.
**Why bad:** Breaks testability; mutating config mid-run causes subtle bugs.
**Instead:** Pass config object explicitly into services (dependency injection via function args).

### Anti-Pattern 2: Recursive `readdir` with Deep Assumptions

**What:** Recursively walking `files/` and assuming flat structure.
**Why bad:** If a package has nested directories (e.g. `.claude/commands/`), shallow readdir misses files; fully recursive may over-create directories in target.
**Instead:** Walk `files/` recursively, collecting only files (not directories). Create parent directories in the target as needed before symlinking individual files.

### Anti-Pattern 3: Symlinking Directories Instead of Files

**What:** Symlinking the `files/` directory itself into the project.
**Why bad:** Two packages contributing to `.claude/` would conflict — last write wins.
**Instead:** Symlink individual files. The PROJECT.md decision is correct: symlink individual files, never directories.

### Anti-Pattern 4: Trusting the Filesystem for Installed State

**What:** Checking if a symlink exists at the target to determine if a package is installed.
**Why bad:** Symlinks can be deleted manually; `data.json` and filesystem can drift.
**Instead:** `data.json` is the authoritative source of truth (as specified in PROJECT.md). The symlink check is secondary (for conflict detection only).

### Anti-Pattern 5: Using Synchronous fs APIs

**What:** `fs.symlinkSync`, `fs.readdirSync` throughout.
**Why bad:** Blocks the event loop; makes concurrent operations impossible later.
**Instead:** Use `fs/promises` throughout. `manage` naturally awaits per-file operations sequentially (to allow per-conflict prompts).

---

## Suggested Build Order

Dependencies between components drive the order. Build lower layers first.

```
Layer 0 (no dependencies):
  1. fs-utils.js             — only depends on Node.js built-ins

Layer 1 (depends on Layer 0):
  2. config.js               — reads/writes ~/.clawd-linker via fs-utils
  3. package-registry.js     — reads package dirs via fs-utils
  4. package-state.js        — reads/writes data.json via fs-utils

Layer 2 (depends on Layers 0-1):
  5. symlink-manager.js      — uses fs-utils + package-registry (file lists)

Layer 3 (depends on all services):
  6. commands/init.js        — uses config + fs-utils
  7. commands/new.js         — uses config + fs-utils + package-state
  8. commands/manage.js      — uses all services + inquirer

Layer 4 (wires everything):
  9. bin/clawd-linker.js     — arg parsing (commander/yargs) + command routing
```

**Rationale for this order:**

- `fs-utils` first because every other component depends on it. Build it once, test it, never revisit.
- Config and package-state before commands because commands are integration points — they can't be tested or reasoned about until their dependencies exist.
- `manage.js` last among commands because it exercises the full system (reads packages, checks state, creates/removes symlinks, prompts for conflicts).
- The bin entry last because it's pure wiring — it adds no logic.

---

## File Structure

```
clawd-linker/
├── bin/
│   └── clawd-linker.js         # shebang entry, routes argv to commands
├── src/
│   ├── commands/
│   │   ├── init.js
│   │   ├── new.js
│   │   └── manage.js
│   ├── services/
│   │   ├── package-registry.js
│   │   ├── package-state.js
│   │   └── symlink-manager.js
│   ├── config.js               # global config (~/.clawd-linker)
│   └── utils/
│       └── fs.js               # only fs/promises importer
├── package.json                # "type": "module", bin entry, dependencies
└── .gitignore
```

---

## Scalability Considerations

This is a personal tool. Scalability concerns are minimal. Two risks worth noting:

| Concern | At current scale (personal) | If it grew |
|---------|---------------------------|------------|
| Many packages (100+) | `readdir` + `data.json` reads are all async; fine | Add indexing or caching in Package Registry |
| Many projects per package | `data.json` with array of paths; trivially small | Still fine; paths are short strings |
| Large files/ trees | File-by-file symlink is O(n files); acceptable | Parallelise with `Promise.all` in Symlink Manager |

No database, no server, no network. The architecture ceiling is very high for this use case.

---

## Sources

- Node.js `fs/promises` documentation (built-in knowledge, HIGH confidence)
- Commander.js / yargs CLI routing patterns (established patterns, HIGH confidence)
- Symlink manager architecture derived from tools like `stow`, `dotbot`, and `mackup` — well-documented in their respective documentation (MEDIUM confidence — design analogies, not direct ports)
- Single-responsibility / thin-command pattern: standard Node.js CLI best practice (HIGH confidence)
