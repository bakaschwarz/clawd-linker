import { mkdir, lstat, readlink, unlink, symlink, rename, readdir, rmdir } from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { walkFiles } from '../utils/fs.js';
import { readState, writeState } from './package-state.js';
import { isMergeable } from './merge-manager.js';
import type { Package, ConflictCallback, InstallOptions } from '../types.js';

export async function installPackage(
  pkg: Package,
  projectPath: string,
  conflictCallback: ConflictCallback,
  { dryRun = false }: InstallOptions = {}
): Promise<string[]> {
  const files = await walkFiles(pkg.filesPath);
  const ownedLinks: string[] = [];

  for (const relPath of files) {
    // Mergeable files (e.g. .md) are handled by merge-manager — skip symlink creation
    if (isMergeable(relPath)) continue;

    const source = path.resolve(pkg.filesPath, relPath);   // absolute — LINK-02
    const target = path.resolve(projectPath, relPath);      // absolute — LINK-02

    // Create parent directories as needed — LINK-03
    if (!dryRun) {
      await mkdir(path.dirname(target), { recursive: true });
    }

    const stat = await lstat(target).catch(() => null);

    if (stat && stat.isSymbolicLink()) {
      const existing = await readlink(target);
      if (existing === source) {
        // Already correct symlink — idempotent no-op (STATE-03)
        ownedLinks.push(target);
        continue;
      }
      // Symlink exists but points elsewhere — remove and recreate
      if (!dryRun) {
        await unlink(target);
      }
    } else if (stat) {
      // Real file or directory exists at target — LINK-05: prompt per-conflict
      if (dryRun) {
        console.log(chalk.cyan('  [dry-run] would overwrite: ' + path.relative(projectPath, target)));
        ownedLinks.push(target);
        continue;
      }
      const action = await conflictCallback(target);
      if (action === 'skip') continue;
      // Backup before overwrite — Pitfall 7 prevention
      // WR-01: avoid clobbering an existing backup with a timestamped name
      const backupPath = target + '.cla-backup';
      const backupStat = await lstat(backupPath).catch(() => null);
      if (backupStat) {
        await rename(target, `${target}.cla-backup-${Date.now()}`);
      } else {
        await rename(target, backupPath);
      }
    }

    if (dryRun) {
      console.log(chalk.cyan('  [dry-run] would create symlink: ' + path.relative(projectPath, target)));
    } else {
      await symlink(source, target);
    }
    ownedLinks.push(target);
  }

  if (!dryRun) {
    // Update data.json with owned symlinks
    // WR-04: merge with previously recorded links so stale paths (source file deleted)
    // are retained and can be cleaned up by uninstallPackage rather than leaking.
    const state = await readState(pkg.dataJsonPath);
    const previousLinks = state.installedIn[projectPath] ?? [];
    const currentSet = new Set(ownedLinks);
    const merged = [...ownedLinks, ...previousLinks.filter(p => !currentSet.has(p))];
    state.installedIn[projectPath] = merged;
    await writeState(pkg.dataJsonPath, state);
  }

  return ownedLinks;
}

export async function uninstallPackage(
  pkg: Package,
  projectPath: string,
  { dryRun = false }: InstallOptions = {}
): Promise<string[]> {
  const state = await readState(pkg.dataJsonPath);
  const ownedLinks = state.installedIn[projectPath] ?? [];
  const removed: string[] = [];

  for (const linkPath of ownedLinks) {
    const stat = await lstat(linkPath).catch(() => null);
    if (stat && stat.isSymbolicLink()) {
      if (dryRun) {
        console.log(chalk.cyan('  [dry-run] would remove symlink: ' + path.relative(projectPath, linkPath)));
      } else {
        await unlink(linkPath);
      }
      removed.push(linkPath);
    }
    // If not a symlink (manually deleted or replaced), skip silently
  }

  if (!dryRun) {
    // Remove project entry from data.json
    delete state.installedIn[projectPath];
    if (state.orderIn) {
      delete state.orderIn[projectPath];
    }
    if (state.mergedIn) {
      delete state.mergedIn[projectPath];
    }
    await writeState(pkg.dataJsonPath, state);
  }

  return removed;
}

export async function cleanEmptyDirs(removedPaths: string[], projectPath: string): Promise<void> {
  const dirs = new Set<string>();
  // Append separator so sibling dirs (e.g. /proj-backup) are not matched as sub-paths
  const projectRoot = projectPath.endsWith(path.sep) ? projectPath : projectPath + path.sep;
  for (const p of removedPaths) {
    let dir = path.dirname(p);
    while (dir !== projectPath && dir.startsWith(projectRoot)) {
      dirs.add(dir);
      dir = path.dirname(dir);
    }
  }
  const sorted = [...dirs].sort((a, b) => b.length - a.length);
  for (const dir of sorted) {
    try {
      const entries = await readdir(dir);
      if (entries.length === 0) await rmdir(dir);
    } catch {
      // ENOTEMPTY or already removed — skip
    }
  }
}
