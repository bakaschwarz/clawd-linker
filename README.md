<img src="https://raw.githubusercontent.com/bakaschwarz/clawd-linker/main/.github/logo.svg" alt="cla(-lin)ker" />

Pull your skills, agents, rules, docs, etc. from a central repository and link them as packages into your projects as symlinks.

## Motivation

I made this tool since i could not find a good way to add knowledge and files to multiple projects using AI agents without information rot beginning almost immediately.
Updating a change in my sub-agent in multiple projects with the same structure quickly became a nightmare to manage.
At first, i sym-linked some files manually, but thought there must be a better way.

Enter `cla-linker`.

This tool allows me to manage knowledge at a central space and link as many files and directories as needed into my projects, with no assumption on structure.
So not only can i share the exact same docs across many projects, i can also share my agents, rules, etc.

Because of the nature of this tool, i am also able to use it with basically any agent harness, which is a plus in a world where the *best* tool changes almost every week.

## Requirements

- Node.js >= 20.12.0

## Usage

```bash
npx cla-linker <command>
```

## Commands

### `init`

Set up your central package repository (run once).

```bash
npx cla-linker init
```

Prompts for a directory path, creates it, runs `git init`, and saves the path to `~/.cla-linker`.

### `new <name>`

Create a new package in the repository.

```bash
npx cla-linker new my-package
```

Scaffolds `<repo>/<name>/` with:
- `files/` — place the files you want symlinked into projects here
- `PACKAGE.md` — package description
- `data.json` — install state (git-ignored)

### `manage` (alias: `m`)

Install or uninstall packages in the current project.

```bash
npx cla-linker manage
```

Opens a checkbox list of all packages. Toggle with Space, confirm with Enter. Already-installed packages are pre-checked. After selection, shows a diff (install/uninstall) and asks for confirmation before applying.

**Conflict handling:** if a file already exists at a symlink target, you're prompted per-file whether to overwrite (original is backed up with a timestamp suffix) or skip.

## Config

Global config is stored at `~/.cla-linker`. Delete this file to reconfigure.
