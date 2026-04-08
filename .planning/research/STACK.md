# Technology Stack

**Project:** clawd-linker
**Domain:** Node.js CLI symlink package manager
**Researched:** 2026-04-08
**Confidence:** HIGH (all versions verified via npm registry; download counts pulled from npmjs API week of 2026-04-01)

---

## Recommended Stack

### Runtime and Module Format

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Module format | **ESM** (`"type": "module"`) | All shortlisted libraries are ESM-only in their current major versions (`@inquirer/prompts`, `conf`, `execa`, `chalk`, `ora`). Choosing CJS forces downgrading every dependency to an older major — not worth it. |
| Node.js minimum | **>=20.12.0** | Required by `@inquirer/prompts` (most restrictive). Node 20 is Active LTS through April 2026; Node 22 is the new LTS. `npx` will use whatever Node the user has installed — document this requirement in README. |
| Language | **Plain ESM JavaScript** (no TypeScript compile step) | This is a personal tool; adding a build step (`tsup`, `tsc`) just to run `npx clawd-linker` means either shipping a `dist/` or requiring callers to have `tsx` on PATH. Plain ESM avoids that entirely. Use JSDoc `@param` types for IDE autocompletion if desired. |

**Confidence:** HIGH — verified engine requirements with `npm view`.

---

### CLI Framework

| Library | Version | Weekly Downloads | Purpose |
|---------|---------|-----------------|---------|
| **commander** | 14.0.3 | 316 M | Argument parsing, subcommand routing, `--help` generation |

**Use commander.** It is the dominant Node.js CLI framework by an order of magnitude (316 M/week vs yargs at ~56 M, oclif as a full framework). It ships with built-in TypeScript types (`typings/index.d.ts`), supports ESM, and handles the three commands needed (`init`, `new`, `manage`) with no ceremony.

Do not use:
- **yargs** — more configuration surface than needed for 3 subcommands; commander is simpler
- **oclif** — designed for large CLI suites with plugins; heavy overkill for a personal tool
- **meow** (Sindre Sorhus) — ESM-only, minimal, but lacks subcommand routing without extra wiring

**Confidence:** HIGH

---

### Interactive TUI / Prompts

| Library | Version | Weekly Downloads | Purpose |
|---------|---------|-----------------|---------|
| **@inquirer/prompts** | 8.4.1 | 19.3 M | All interactive prompts: checkbox list, confirm, input |
| **@inquirer/checkbox** | 5.1.3 | (sub-package) | The checkbox prompt specifically |

`@inquirer/prompts` is the official, actively maintained successor to the legacy `inquirer` package. The split into focused sub-packages happened in v9; `@inquirer/prompts` re-bundles them for convenience. It includes `checkbox` (multi-select), `confirm`, and `input` — exactly what clawd-linker needs.

The checkbox prompt supports:
- Arrow-key navigation
- Space to toggle, Enter to confirm
- Pre-checked items (via `checked: true` on choices)
- Page scrolling for long lists

**Alternatives considered:**

| Library | Version | Downloads | Why not |
|---------|---------|-----------|---------|
| `@clack/prompts` | 1.2.0 | 8.2 M | Beautiful output but lacks a checkbox/multi-select prompt as of this research — only single-select (`select`) is built-in. |
| legacy `inquirer` | 13.4.1 | 41.5 M | The `latest` tag is the new rewrite that maps to `@inquirer/prompts`; the old API is on the `legacy` dist-tag. Use the scoped packages directly to avoid confusion. |
| `ink` | 7.0.0 | — | React-for-terminal. Powerful but adds React as a runtime dependency. Overkill when `@inquirer/prompts` covers all needed interactions. |

**Confidence:** HIGH

---

### Config File (Global `~/.clawd-linker`)

| Library | Version | Weekly Downloads | Purpose |
|---------|---------|-----------------|---------|
| **conf** | 15.1.0 | 3.3 M | Read/write JSON config at `~/.clawd-linker` with atomic writes and schema validation |

`conf` from Sindre Sorhus is the canonical solution for CLI tool config. It handles the XDG config directory, atomic writes (prevents partial-write corruption), and optional Zod-based schema validation. It is ESM-only at v15.

**Alternative — plain `fs.readFile` / `fs.writeFile` + `JSON.parse`:**
Entirely viable for this project since the config is a single flat file with one field (`repoPath`). If you want zero dependencies for config, use `os.homedir()` + `path.join` + `JSON.stringify`. The tradeoff: no atomic writes. For a personal tool with a tiny config, that risk is acceptable.

**Recommendation:** Start with `conf`. Switch to plain `fs` only if ESM interop causes friction at build time.

**Confidence:** MEDIUM — `conf` is well-established; the "use plain fs" path is equally valid for this scope.

---

### Git Integration

| Library | Version | Weekly Downloads | Purpose |
|---------|---------|-----------------|---------|
| **simple-git** | 3.35.2 | 10 M | `git init` on new repo, `.gitignore` management |

`simple-git` wraps the system `git` binary with a promise-based fluent API. It has been the standard choice for Node.js git scripting for years.

`clawd-linker` needs git only for:
1. `git init` when creating a new package repo
2. Appending to `.gitignore` (plain file write is simpler here)

That scope does not justify `isomorphic-git` (pure-JS reimplementation, 959 K/week), which is designed for environments without a `git` binary (CI containers, browsers). Since this tool runs on macOS where `git` is always available, `simple-git` is correct.

**Alternative — shell out directly with `child_process.execFile`:**
`git init <path>` is a single command. If you want zero git-library dependency, `execFile('git', ['init', repoPath])` works fine. The risk is weaker error handling — `simple-git` gives structured errors; `execFile` gives raw stderr strings.

**Recommendation:** Use `simple-git`. If the git surface stays at just `init`, consider dropping it and using `execa('git', ['init', path])` instead.

**Confidence:** HIGH

---

### Process Execution (for shelling out)

| Library | Version | Weekly Downloads | Purpose |
|---------|---------|-----------------|---------|
| **execa** | 9.6.1 | 114 M | Run subprocesses if needed beyond simple-git |

`execa` is the de-facto standard for subprocess execution in Node.js (114 M/week). ESM-only at v9. Provides structured error objects, easy stdout/stderr capture, and pipe support.

For clawd-linker this would be used if `simple-git` is dropped, or for any future git subcommands not covered by simple-git's API.

Node.js built-in `child_process.execFile` is a valid alternative if keeping zero dependencies is a goal. `execa` is only worth adding if subprocess calls become frequent.

**Confidence:** HIGH

---

### Filesystem Operations

**Use Node.js built-in `fs/promises` only. No third-party library needed.**

Verified native APIs cover all requirements:

| Operation | API |
|-----------|-----|
| Create symlink | `fs.symlink(target, path)` |
| Remove symlink | `fs.unlink(path)` |
| Read symlink target | `fs.readlink(path)` |
| Check if symlink | `fs.lstat(path)` → check `stats.isSymbolicLink()` |
| Read/write JSON | `fs.readFile` + `JSON.parse` / `JSON.stringify` + `fs.writeFile` |
| Walk directory | `fs.readdir(path, { withFileTypes: true, recursive: true })` (Node 18.17+) |
| Create directory | `fs.mkdir(path, { recursive: true })` |

Do not add `fs-extra` or `glob` — everything needed is in the standard library for Node >= 20.

**Confidence:** HIGH — verified by running `typeof fs.symlink` etc. against local Node 24.

---

### Terminal Output Styling

| Library | Version | Weekly Downloads | Purpose |
|---------|---------|-----------------|---------|
| **chalk** | 5.6.2 | 374 M | Colored terminal output (errors red, success green) |

Chalk is the undisputed standard (374 M/week). ESM-only at v5. For a tool this size, it is the only styling library needed.

Do not add `ora` (spinners) unless operations become async-heavy and users need progress feedback. For the initial build, instant feedback from chalk is sufficient.

**Confidence:** HIGH

---

### Testing

| Library | Version | Weekly Downloads | Purpose |
|---------|---------|-----------------|---------|
| **vitest** | 4.1.3 | 39.8 M | Unit and integration tests |

vitest and jest are neck-and-neck in weekly downloads (39.8 M vs 40.1 M). For a pure ESM project without a build step, vitest is the correct choice: it runs ESM natively without babel transforms, has zero configuration, and the API is jest-compatible. Jest requires additional ESM configuration (`--experimental-vm-modules`) that adds friction.

**Confidence:** HIGH

---

## Full Dependency List

### Runtime dependencies

```bash
npm install commander @inquirer/prompts conf simple-git chalk
```

| Package | Version Pin | Rationale |
|---------|-------------|-----------|
| `commander` | `^14.0.3` | CLI routing |
| `@inquirer/prompts` | `^8.4.1` | Interactive checkbox + confirm prompts |
| `conf` | `^15.1.0` | Global config at `~/.clawd-linker` |
| `simple-git` | `^3.35.2` | `git init` for new package repos |
| `chalk` | `^5.6.2` | Terminal output color |

### Dev dependencies

```bash
npm install -D vitest
```

| Package | Version Pin | Rationale |
|---------|-------------|-----------|
| `vitest` | `^4.1.3` | Test runner with native ESM support |

### Intentionally omitted

| Package | Reason |
|---------|--------|
| `execa` | Not needed; simple-git covers git; fs built-ins cover the rest |
| `ora` | No long-running async operations in v1 |
| `@types/node` | Project is plain JS, not TypeScript |
| `tsup` / `tsx` | No build step; plain ESM runs directly via `node` |
| `zod` | Config schema is trivial (single field); not worth the dependency |
| `fs-extra` | Node >= 20 built-ins are sufficient |
| `glob` | `fs.readdir` with `recursive: true` is sufficient |
| `ink` | React-in-terminal is overkill for a 3-command tool |
| `@clack/prompts` | No multi-select prompt; missing key feature |

---

## package.json Structure

```json
{
  "name": "clawd-linker",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "clawd-linker": "./bin/clawd-linker.js"
  },
  "engines": {
    "node": ">=20.12.0"
  },
  "files": [
    "bin/",
    "src/"
  ]
}
```

The `bin` field is what `npx clawd-linker` resolves to. The entry file must have a `#!/usr/bin/env node` shebang and be executable (`chmod +x`). No bundling required — `npx` downloads and runs the package directly.

**Confidence:** HIGH

---

## Alternatives Considered (Summary)

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| CLI framework | `commander` | `yargs` | More config overhead for 3 subcommands |
| CLI framework | `commander` | `oclif` | Plugin framework overkill for personal tool |
| Interactive prompts | `@inquirer/prompts` | `@clack/prompts` | Clack lacks multi-select / checkbox prompt |
| Interactive prompts | `@inquirer/prompts` | `ink` | React runtime dependency; overkill |
| Config | `conf` | plain `fs` + JSON | Both valid; `conf` adds atomic writes |
| Git | `simple-git` | `isomorphic-git` | isomorphic-git is for no-git-binary envs (browsers/CI) |
| Git | `simple-git` | shell `execa('git', [...])` | simple-git gives structured errors; reasonable swap if surface stays minimal |
| Filesystem | `fs/promises` (built-in) | `fs-extra` | Node 20 covers everything needed |
| Testing | `vitest` | `jest` | Jest requires ESM transform config; vitest is zero-config for ESM |
| Language | Plain ESM JS | TypeScript | No build step = simpler npx distribution |

---

## Sources

- npm registry version data: verified via `npm view <package> version` (2026-04-08)
- Download counts: npmjs.com downloads API (`/downloads/point/last-week/<pkg>`), week of 2026-04-01
- Engine requirements: verified via `npm view <package> engines` (2026-04-08)
- Node.js `fs/promises` API coverage: verified by running `typeof fs.symlink` etc. against Node 24.14.0
- `@inquirer/prompts` checkbox feature set: package description and keywords from npm registry
- `conf` ESM-only status: verified via `npm view conf type` → `"module"` (2026-04-08)
