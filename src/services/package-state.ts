import { readFile, writeFile, rename, lstat, readlink } from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import type { Package, PackageState, ReconcileResult } from '../types.js';

async function readState(dataJsonPath: string): Promise<PackageState> {
  try {
    const raw = await readFile(dataJsonPath, 'utf8');
    const parsed = JSON.parse(raw) as PackageState;
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

async function writeState(dataJsonPath: string, state: PackageState): Promise<void> {
  const tmp = dataJsonPath + '.tmp';
  await writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
  await rename(tmp, dataJsonPath);
}

export async function getOrderedInstalledPackages(projectPath: string, packages: Package[]): Promise<Package[]> {
  const withOrder: Array<{ pkg: Package; order: number }> = [];
  for (const pkg of packages) {
    const state = await readState(pkg.dataJsonPath);
    const hasSymlinks = (state.installedIn[projectPath]?.length ?? 0) > 0;
    const hasMerged = (state.mergedIn?.[projectPath]?.length ?? 0) > 0;
    if (hasSymlinks || hasMerged) {
      withOrder.push({ pkg, order: state.orderIn?.[projectPath] ?? Infinity });
    }
  }
  withOrder.sort((a, b) => a.order - b.order);
  return withOrder.map(({ pkg }) => pkg);
}

export async function setPackageOrder(pkg: Package, projectPath: string, position: number): Promise<void> {
  const state = await readState(pkg.dataJsonPath);
  state.orderIn = state.orderIn ?? {};
  state.orderIn[projectPath] = position;
  await writeState(pkg.dataJsonPath, state);
}

export async function getInstalledPackages(projectPath: string, packages: Package[]): Promise<Set<string>> {
  const installed = new Set<string>();
  for (const pkg of packages) {
    const state = await readState(pkg.dataJsonPath);
    const hasSymlinks = (state.installedIn[projectPath]?.length ?? 0) > 0;
    const hasMerged = (state.mergedIn?.[projectPath]?.length ?? 0) > 0;
    if (hasSymlinks || hasMerged) {
      installed.add(pkg.name);
    }
  }
  return installed;
}

export async function reconcileLinks(pkg: Package, projectPath: string): Promise<ReconcileResult> {
  const state = await readState(pkg.dataJsonPath);
  const recordedLinks = state.installedIn[projectPath];

  if (!recordedLinks || recordedLinks.length === 0) {
    return { pruned: 0 };
  }

  const verified: string[] = [];
  let changed = false;

  for (const linkPath of recordedLinks) {
    const relPath = path.relative(projectPath, linkPath);

    // Guard: linkPath escapes projectPath — treat as stale and prune
    if (relPath.startsWith('..')) {
      changed = true;
      continue;
    }

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

  // Reconcile mergedIn: prune entries where the target file no longer exists
  const recordedMerged = state.mergedIn?.[projectPath];
  if (recordedMerged && recordedMerged.length > 0) {
    const verifiedMerged: string[] = [];
    let mergedChanged = false;
    for (const filePath of recordedMerged) {
      const stat = await lstat(filePath).catch(() => null);
      if (stat && stat.isFile()) {
        verifiedMerged.push(filePath);
      } else {
        mergedChanged = true;
      }
    }
    if (mergedChanged) {
      state.mergedIn = state.mergedIn ?? {};
      if (verifiedMerged.length === 0) {
        delete state.mergedIn[projectPath];
      } else {
        state.mergedIn[projectPath] = verifiedMerged;
      }
      await writeState(pkg.dataJsonPath, state);
    }
  }

  return { pruned: recordedLinks.length - verified.length };
}

export { readState, writeState };
