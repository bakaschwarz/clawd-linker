import path from 'path';
import { walkFiles, symlink, unlink, lstat, readlink, mkdir, rename } from '../utils/fs.js';
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
 * @returns {Promise<string[]>} Array of absolute symlink target paths that were created or already existed
 */
export async function installPackage(pkg, projectPath, conflictCallback) {
  const files = await walkFiles(pkg.filesPath);
  const ownedLinks = [];

  for (const relPath of files) {
    const source = path.resolve(pkg.filesPath, relPath);   // absolute — LINK-02
    const target = path.resolve(projectPath, relPath);      // absolute — LINK-02

    // Create parent directories as needed — LINK-03
    await mkdir(path.dirname(target), { recursive: true });

    const stat = await lstat(target).catch(() => null);

    if (stat && stat.isSymbolicLink()) {
      const existing = await readlink(target);
      if (existing === source) {
        // Already correct symlink — idempotent no-op (STATE-03)
        ownedLinks.push(target);
        continue;
      }
      // Symlink exists but points elsewhere — remove and recreate
      await unlink(target);
    } else if (stat) {
      // Real file or directory exists at target — LINK-05: prompt per-conflict
      const action = await conflictCallback(target);
      if (action === 'skip') continue;
      // Backup before overwrite — Pitfall 7 prevention
      await rename(target, target + '.clawd-backup');
    }

    await symlink(source, target);
    ownedLinks.push(target);
  }

  // Update data.json with owned symlinks
  const state = await readState(pkg.dataJsonPath);
  state.installedIn[projectPath] = ownedLinks;
  await writeState(pkg.dataJsonPath, state);

  return ownedLinks;
}

/**
 * Uninstall a package from a project by removing exactly the owned symlinks.
 * Only removes paths recorded in data.json for this project (LINK-04).
 * Verifies each path is still a symlink before removing (defensive).
 *
 * @param {import('./package-registry.js').PackageDescriptor} pkg - Package to uninstall
 * @param {string} projectPath - Absolute path to project root
 * @returns {Promise<string[]>} Array of absolute paths that were removed
 */
export async function uninstallPackage(pkg, projectPath) {
  const state = await readState(pkg.dataJsonPath);
  const ownedLinks = state.installedIn[projectPath] || [];
  const removed = [];

  for (const linkPath of ownedLinks) {
    const stat = await lstat(linkPath).catch(() => null);
    if (stat && stat.isSymbolicLink()) {
      await unlink(linkPath);
      removed.push(linkPath);
    }
    // If not a symlink (manually deleted or replaced), skip silently
  }

  // Remove project entry from data.json
  delete state.installedIn[projectPath];
  await writeState(pkg.dataJsonPath, state);

  return removed;
}
