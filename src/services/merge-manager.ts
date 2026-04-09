import path from 'path';
import { readFile, writeFile, mkdir, unlink } from 'fs/promises';
import { lstat } from 'fs/promises';
import chalk from 'chalk';
import { walkFiles } from '../utils/fs.js';
import { readState, writeState } from './package-state.js';
import type { Package } from '../types.js';

export const MERGEABLE_EXTENSIONS = ['.md'];
export const USER_SECTION_MARKER = '<!-- ===== USER CONTENT - SAFE TO EDIT BELOW ===== -->';

export function isMergeable(relPath: string): boolean {
  return MERGEABLE_EXTENSIONS.includes(path.extname(relPath).toLowerCase());
}

/** Collect all mergeable relPaths across the given packages, mapped to the ordered packages that contain them. */
async function buildMergeSet(packages: Package[]): Promise<Map<string, Package[]>> {
  const result = new Map<string, Package[]>();
  for (const pkg of packages) {
    const stat = await lstat(pkg.filesPath).catch(() => null);
    if (!stat) continue;
    const files = await walkFiles(pkg.filesPath);
    for (const relPath of files) {
      if (!isMergeable(relPath)) continue;
      const existing = result.get(relPath) ?? [];
      existing.push(pkg);
      result.set(relPath, existing);
    }
  }
  return result;
}

/** Extract user content from an existing managed file. Returns [managedContent, userContent]. */
function splitManagedFile(content: string): { userSection: string; hasMarker: boolean } {
  const markerIndex = content.indexOf(USER_SECTION_MARKER);
  if (markerIndex === -1) {
    return { userSection: content, hasMarker: false };
  }
  const afterMarker = content.slice(markerIndex + USER_SECTION_MARKER.length);
  // Strip leading newline after marker
  const userSection = afterMarker.startsWith('\n') ? afterMarker.slice(1) : afterMarker;
  return { userSection, hasMarker: true };
}

/**
 * Merge mergeable files (e.g. .md) from all selected packages into real files in the project.
 * Preserves user content below the marker across rebuilds.
 *
 * @param selectedPackages Ordered list of selected packages (index 0 = top of merged file)
 * @param prevPackages     Previously installed packages (used to detect files to clean up)
 * @param projectPath      Absolute path to the project
 */
/**
 * @returns Map of package name → number of merged files written for that package.
 */
export async function mergeAll(
  selectedPackages: Package[],
  prevPackages: Package[],
  projectPath: string,
  { dryRun = false }: { dryRun?: boolean } = {}
): Promise<Map<string, number>> {
  const [newMergeSet, oldMergeSet] = await Promise.all([
    buildMergeSet(selectedPackages),
    buildMergeSet(prevPackages),
  ]);

  // Cleanup: relPaths no longer covered by any selected package
  for (const [relPath] of oldMergeSet) {
    if (newMergeSet.has(relPath)) continue;
    const targetPath = path.resolve(projectPath, relPath);
    const existing = await readFile(targetPath, 'utf8').catch(() => null);
    if (existing === null) continue;

    const { userSection, hasMarker } = splitManagedFile(existing);
    if (!hasMarker) continue; // Not our file — leave it alone

    if (userSection.trim() === '') {
      // No user content — delete the file entirely
      if (dryRun) {
        console.log(chalk.cyan(`  [dry-run] would delete merged file: ${relPath}`));
      } else {
        await unlink(targetPath);
        console.log(chalk.red(`  Removed merged file: ${relPath}`));
      }
    } else {
      // Leave user content as a plain file
      if (dryRun) {
        console.log(chalk.cyan(`  [dry-run] would strip managed content from: ${relPath} (user section kept)`));
      } else {
        await writeFile(targetPath, userSection, 'utf8');
        console.log(chalk.yellow(`  Stripped managed content from ${relPath} — user section kept`));
      }
    }
  }

  // Track per-package contributed target paths for data.json + return value
  const packageMergedPaths = new Map<string, string[]>(); // pkgName → absolute target paths

  // Write / update merged files
  for (const [relPath, pkgs] of newMergeSet) {
    const targetPath = path.resolve(projectPath, relPath);

    // Record contribution for each package
    for (const pkg of pkgs) {
      const paths = packageMergedPaths.get(pkg.name) ?? [];
      paths.push(targetPath);
      packageMergedPaths.set(pkg.name, paths);
    }

    // Read source content from each package
    const parts: string[] = [];
    for (const pkg of pkgs) {
      const srcPath = path.resolve(pkg.filesPath, relPath);
      const content = await readFile(srcPath, 'utf8');
      parts.push(content.trimEnd());
    }

    // Determine user section from existing target (if any)
    const existing = await readFile(targetPath, 'utf8').catch(() => null);
    let userSection = '';
    if (existing !== null) {
      const split = splitManagedFile(existing);
      userSection = split.hasMarker
        ? split.userSection   // previously managed — extract user content
        : existing;           // plain file — treat entire content as user section
    }

    const managedBlock = parts.join('\n\n');
    const output = `${managedBlock}\n\n${USER_SECTION_MARKER}\n${userSection}`;

    if (dryRun) {
      const label = pkgs.length === 1 ? 'write' : `merge ${pkgs.length} packages into`;
      console.log(chalk.cyan(`  [dry-run] would ${label}: ${relPath}`));
      continue;
    }

    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, output, 'utf8');

    const label = pkgs.length === 1 ? `Written` : `Merged ${pkgs.length} packages →`;
    console.log(chalk.green(`  ${label} ${relPath}`));
  }

  // Persist mergedIn state for each selected package
  if (!dryRun) {
    for (const pkg of selectedPackages) {
      const paths = packageMergedPaths.get(pkg.name) ?? [];
      const state = await readState(pkg.dataJsonPath);
      state.mergedIn = state.mergedIn ?? {};
      if (paths.length === 0) {
        delete state.mergedIn[projectPath];
      } else {
        state.mergedIn[projectPath] = paths;
      }
      await writeState(pkg.dataJsonPath, state);
    }
  }

  // Return per-package merged file counts
  const counts = new Map<string, number>();
  for (const pkg of selectedPackages) {
    counts.set(pkg.name, packageMergedPaths.get(pkg.name)?.length ?? 0);
  }
  return counts;
}
