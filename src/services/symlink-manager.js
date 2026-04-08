import path from 'path';
import chalk from 'chalk';
import { walkFiles, symlink, unlink, lstat, readlink, mkdir, rename, rmdir, readdir } from '../utils/fs.js';
import { readState, writeState } from './package-state.js';

/**
 * Install a package into a project by creating per-file symlinks.
 * - Walks pkg.filesPath recursively (LINK-01)
 * - Uses absolute paths for both source and target (LINK-02)
 * - Creates parent directories as needed (LINK-03)
 * - Detects conflicts with existing real files (LINK-05)
 * - Skips already-correct symlinks for idempotency (STATE-03)
 *
 * @param {import('./package-registry.js').PackageDescriptor} pkg - Package to install
 * @param {string} projectPath - Absolute path to project root
 * @param {function(string): Promise<'skip'|'overwrite'>} conflictCallback - Called per conflict
 * @param {{ dryRun?: boolean }} [options]
 * @returns {Promise<string[]>} Array of absolute symlink target paths that were created or already existed
 */
export async function installPackage(pkg, projectPath, conflictCallback, { dryRun = false } = {}) {
  const files = await walkFiles(pkg.filesPath);
  const ownedLinks = [];

  for (const relPath of files) {
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
      const backupPath = target + '.clawd-backup';
      const backupStat = await lstat(backupPath).catch(() => null);
      if (backupStat) {
        await rename(target, `${target}.clawd-backup-${Date.now()}`);
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
    const previousLinks = state.installedIn[projectPath] || [];
    const currentSet = new Set(ownedLinks);
    const merged = [...ownedLinks, ...previousLinks.filter(p => !currentSet.has(p))];
    state.installedIn[projectPath] = merged;
    await writeState(pkg.dataJsonPath, state);
  }

  return ownedLinks;
}

/**
 * Uninstall a package from a project by removing exactly the owned symlinks.
 * Only removes paths recorded in data.json for this project (LINK-04).
 * Verifies each path is still a symlink before removing (defensive).
 *
 * @param {import('./package-registry.js').PackageDescriptor} pkg - Package to uninstall
 * @param {string} projectPath - Absolute path to project root
 * @param {{ dryRun?: boolean }} [options]
 * @returns {Promise<string[]>} Array of absolute paths that were removed
 */
export async function uninstallPackage(pkg, projectPath, { dryRun = false } = {}) {
  const state = await readState(pkg.dataJsonPath);
  const ownedLinks = state.installedIn[projectPath] || [];
  const removed = [];

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
    await writeState(pkg.dataJsonPath, state);
  }

  return removed;
}

/**
 * Remove empty directories that were left behind after uninstalling symlinks.
 * Traverses parent dirs of removed paths up to (but not including) projectPath,
 * sorted deepest-first, removing only empty ones.
 *
 * @param {string[]} removedPaths - Absolute paths of removed symlinks
 * @param {string} projectPath - Absolute path to project root (upper bound)
 * @returns {Promise<void>}
 */
export async function cleanEmptyDirs(removedPaths, projectPath) {
  const dirs = new Set();
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
