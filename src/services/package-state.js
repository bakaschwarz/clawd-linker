import path from 'path';
import chalk from 'chalk';
import { readFile, writeFile, rename, lstat, readlink } from '../utils/fs.js';

/**
 * Read the state from a package's data.json.
 * Returns empty state on missing/corrupt file (Pitfall 4 resilience).
 * @param {string} dataJsonPath - Absolute path to data.json
 * @returns {Promise<{schemaVersion: number, installedIn: Object.<string, string[]>}>}
 */
export async function readState(dataJsonPath) {
  try {
    const raw = await readFile(dataJsonPath, 'utf8');
    const parsed = JSON.parse(raw);
    // Validate minimum shape
    if (!parsed.installedIn || typeof parsed.installedIn !== 'object') {
      return { schemaVersion: 1, installedIn: {} };
    }
    if (parsed.schemaVersion && parsed.schemaVersion > 1) {
      console.warn(chalk.yellow(
        `Warning: data.json uses schema version ${parsed.schemaVersion} (this tool supports version 1). Some data may not be handled correctly.`
      ));
    }
    return parsed;
  } catch {
    return { schemaVersion: 1, installedIn: {} };
  }
}

/**
 * Write state to data.json using atomic write pattern (tmp + rename).
 * Prevents truncated JSON on crash (Pitfall 4).
 * @param {string} dataJsonPath - Absolute path to data.json
 * @param {Object} state - State object to write
 */
export async function writeState(dataJsonPath, state) {
  const tmp = dataJsonPath + '.tmp';
  await writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
  await rename(tmp, dataJsonPath);
}

/**
 * Get the set of package names installed in a given project.
 * Reads data.json for each package and checks if projectPath has entries.
 * @param {string} projectPath - Absolute path to the project
 * @param {Array<{name: string, dataJsonPath: string}>} packages - Package descriptors
 * @returns {Promise<Set<string>>} Set of installed package names
 */
export async function getInstalledPackages(projectPath, packages) {
  const installed = new Set();
  for (const pkg of packages) {
    const state = await readState(pkg.dataJsonPath);
    const projectLinks = state.installedIn[projectPath];
    if (projectLinks && projectLinks.length > 0) {
      installed.add(pkg.name);
    }
  }
  return installed;
}

/**
 * Cross-validate data.json entries for a project against the live filesystem.
 * Prunes entries where the symlink is missing, points to wrong target, or is
 * not a symlink. Only writes data.json if changes were made (Pitfall 5).
 *
 * @param {import('./package-registry.js').PackageDescriptor} pkg
 * @param {string} projectPath - Absolute path to the project
 * @returns {Promise<{pruned: number}>} Number of entries pruned
 */
export async function reconcileLinks(pkg, projectPath) {
  const state = await readState(pkg.dataJsonPath);
  const recordedLinks = state.installedIn[projectPath];

  if (!recordedLinks || recordedLinks.length === 0) {
    return { pruned: 0 };
  }

  const verified = [];
  let changed = false;

  for (const linkPath of recordedLinks) {
    const relPath = path.relative(projectPath, linkPath);
    const expectedSource = path.resolve(pkg.filesPath, relPath);

    const stat = await lstat(linkPath).catch(() => null);

    if (!stat) {
      // missing — prune
      changed = true;
      continue;
    }

    if (!stat.isSymbolicLink()) {
      // not-a-symlink (real file replaced it) — prune
      changed = true;
      continue;
    }

    const target = await readlink(linkPath);
    if (target !== expectedSource) {
      // wrong-target — prune
      changed = true;
      continue;
    }

    // ok — keep
    verified.push(linkPath);
  }

  if (changed) {
    if (verified.length === 0) {
      delete state.installedIn[projectPath];
    } else {
      state.installedIn[projectPath] = verified;
    }
    await writeState(pkg.dataJsonPath, state);
  }

  return { pruned: recordedLinks.length - verified.length };
}
