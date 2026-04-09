import path from 'path';
import { watch } from 'fs';
import chalk from 'chalk';
import { getRepoPath } from '../config.js';
import { listPackages } from '../services/package-registry.js';
import { readState, reconcileLinks } from '../services/package-state.js';
import { installPackage } from '../services/symlink-manager.js';
import type { Package } from '../types.js';

interface SyncOptions {
  global?: boolean;
  watch?: boolean;
}

interface SyncStats {
  projects: number;
  symlinks: number;
  errors: Array<{ pkg: string; projectPath: string; err: Error }>;
}

/**
 * Build a map of projectPath -> pkg[] based on data.json installedIn records.
 * If isGlobal is false, only includes entries for the current working directory.
 */
async function buildProjectPackageMap(
  packages: Package[],
  isGlobal: boolean
): Promise<Map<string, Package[]>> {
  const projectPath = path.resolve(process.cwd());
  const map = new Map<string, Package[]>();

  for (const pkg of packages) {
    const state = await readState(pkg.dataJsonPath);
    const projects = Object.keys(state.installedIn ?? {});

    for (const proj of projects) {
      if (!isGlobal && proj !== projectPath) continue;
      const arr = map.get(proj) ?? [];
      arr.push(pkg);
      map.set(proj, arr);
    }
  }

  return map;
}

/**
 * Re-sync all project+package combinations in the map.
 * Prunes stale symlinks, then re-links (idempotent for correct symlinks,
 * creates new symlinks for newly added package files).
 */
async function doSync(projectPkgMap: Map<string, Package[]>): Promise<SyncStats> {
  const stats: SyncStats = { projects: 0, symlinks: 0, errors: [] };
  const home = process.env.HOME ?? '';

  for (const [projectPath, pkgs] of projectPkgMap) {
    stats.projects++;
    const shortPath = projectPath.replace(home, '~');

    for (const pkg of pkgs) {
      try {
        await reconcileLinks(pkg, projectPath);
        // Auto-skip conflicts — non-interactive, never overwrites real files
        const links = await installPackage(pkg, projectPath, () => Promise.resolve('skip'));
        stats.symlinks += links.length;
      } catch (err) {
        const error = err as Error;
        stats.errors.push({ pkg: pkg.name, projectPath: shortPath, err: error });
        console.log(chalk.red(`  Error syncing ${pkg.name} → ${shortPath}: ${error.message}`));
      }
    }
  }

  return stats;
}

function printStats(stats: SyncStats, label?: string): void {
  const prefix = label ? chalk.cyan(`[${label}] `) : '';
  if (stats.errors.length > 0) {
    console.log(`${prefix}${chalk.yellow(`Synced ${stats.projects} project(s) — ${stats.errors.length} error(s).`)}`);
  } else if (stats.projects === 0) {
    console.log(`${prefix}${chalk.yellow('No installed packages found to sync.')}`);
  } else {
    console.log(`${prefix}${chalk.green(`Synced ${stats.projects} project(s).`)}`);
  }
}

/**
 * Watch the central repo for changes in any package's files/ directory.
 * Re-syncs the affected package on change (debounced 300ms).
 */
function startWatch(repoPath: string, packages: Package[], isGlobal: boolean): void {
  const debounceMap = new Map<string, ReturnType<typeof setTimeout>>();

  const watcher = watch(repoPath, { recursive: true }, (event, filename) => {
    if (!filename) return;

    // Normalize separators (Windows compat)
    const parts = filename.split(/[\\/]/);
    if (parts.length < 2 || parts[1] !== 'files') return;

    const pkgName = parts[0];
    const pkg = packages.find(p => p.name === pkgName);
    if (!pkg) return;

    // Debounce per-package
    const existing = debounceMap.get(pkgName);
    if (existing !== undefined) clearTimeout(existing);

    debounceMap.set(pkgName, setTimeout(async () => {
      debounceMap.delete(pkgName);
      console.log(chalk.cyan(`\n[watch] Change in ${pkgName} — syncing...`));
      try {
        const map = await buildProjectPackageMap([pkg], isGlobal);
        const stats = await doSync(map);
        printStats(stats, 'watch');
      } catch (err) {
        console.log(chalk.red(`[watch] Sync failed: ${(err as Error).message}`));
      }
    }, 300));
  });

  process.on('SIGINT', () => {
    watcher.close();
    console.log(chalk.yellow('\nWatch stopped.'));
    process.exit(0);
  });
}

/**
 * `cla-linker sync` (alias `s`) command handler.
 * Re-syncs installed packages with the latest content from the central repo.
 *
 * @param options.global - Sync all registered projects instead of cwd only
 * @param options.watch  - Watch for changes and re-sync automatically
 */
export async function syncCommand(options: SyncOptions): Promise<void> {
  const isGlobal = options.global ?? false;
  const watchMode = options.watch ?? false;

  const repoPath = await getRepoPath();
  const packages = await listPackages(repoPath);

  if (packages.length === 0) {
    console.log(chalk.yellow('No packages found in the repository.'));
    console.log(`Create one with: ${chalk.cyan('cla-linker new <name>')}`);
    return;
  }

  const projectPkgMap = await buildProjectPackageMap(packages, isGlobal);
  const stats = await doSync(projectPkgMap);
  printStats(stats);

  if (watchMode) {
    console.log(chalk.cyan('\nWatching for changes... (Ctrl+C to stop)'));
    startWatch(repoPath, packages, isGlobal);
  }
}
