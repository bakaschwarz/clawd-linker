import path from 'path';
import chalk from 'chalk';
import { checkbox, confirm as inquirerConfirm } from '@inquirer/prompts';
import { getRepoPath } from '../config.js';
import { listPackages } from '../services/package-registry.js';
import { getInstalledPackages, getOrderedInstalledPackages, setPackageOrder, reconcileLinks } from '../services/package-state.js';
import { installPackage, uninstallPackage, cleanEmptyDirs } from '../services/symlink-manager.js';
import { mergeAll } from '../services/merge-manager.js';
import { reorderPrompt } from '../prompts/reorder.js';
import type { ManageOptions, ConflictCallback, Package } from '../types.js';

export async function manageCommand(options: ManageOptions): Promise<void> {
  const dryRun = options.dryRun ?? false;
  const isHeadless = options.yes ?? !process.stdin.isTTY;

  const repoPath = await getRepoPath(); // Exits if not configured (CFG-02)
  const projectPath = path.resolve(process.cwd());
  const packages = await listPackages(repoPath);

  if (packages.length === 0) {
    console.log(chalk.yellow('No packages found in the repository.'));
    console.log(`Create one with: ${chalk.cyan('cla-linker new <name>')}`);
    return;
  }

  // ROB-03: Cross-validate data.json entries against live filesystem
  let totalPruned = 0;
  for (const pkg of packages) {
    const { pruned } = await reconcileLinks(pkg, projectPath);
    totalPruned += pruned;
  }
  if (totalPruned > 0) {
    console.log(chalk.yellow(`Reconciled state: ${totalPruned} stale symlink(s) pruned from data.json.\n`));
  }

  if (dryRun) {
    console.log(chalk.cyan('\n[dry-run] Previewing changes — no files will be modified.\n'));
  }

  // MGR-02: Determine which packages are currently installed (ordered)
  const installed = await getInstalledPackages(projectPath, packages);
  const installedOrdered = await getOrderedInstalledPackages(projectPath, packages);

  // UX-02: Headless mode guard — exit before any interactive prompt
  if (isHeadless) {
    console.log(chalk.yellow('Running in headless mode — no interactive prompts available.'));
    console.log(chalk.yellow('Current selection unchanged. Use manage interactively to change packages.'));
    return;
  }

  // MGR-01: Show checkbox list with pre-checked installed packages
  const selected = await checkbox({
    message: 'Select packages to install (space to toggle, enter to confirm)',
    choices: packages.map(pkg => ({
      name: pkg.name,
      value: pkg.name,
      checked: installed.has(pkg.name),
    })),
    pageSize: 15,
  });

  const selectedSet = new Set(selected);

  // MGR-03: Compute diff — what to install and what to uninstall
  const toInstall = packages.filter(pkg => selectedSet.has(pkg.name) && !installed.has(pkg.name));
  const toUninstall = packages.filter(pkg => !selectedSet.has(pkg.name) && installed.has(pkg.name));

  // ORD-01: Build initial ordered list for selected packages.
  // Already-installed packages retain their saved order; newly selected appended at the top.
  const selectedPackages = packages.filter(pkg => selectedSet.has(pkg.name));
  const installedOrderedNames = installedOrdered.map(p => p.name);
  const newlySelected = selectedPackages.filter(p => !installed.has(p.name));
  const orderedNames: string[] = [
    ...installedOrderedNames.filter(n => selectedSet.has(n)),
    ...newlySelected.map(p => p.name),
  ];

  // ORD-02: Show reorder prompt when 2+ packages are selected
  let finalOrderedNames = orderedNames;
  if (selectedPackages.length >= 2) {
    finalOrderedNames = await reorderPrompt({
      message: 'Package load order (top = applied last = wins conflicts)',
      items: orderedNames,
    });
  }

  const finalOrderedPkgs: Package[] = finalOrderedNames
    .map(name => packages.find(p => p.name === name)!)
    .filter(Boolean);

  const orderChanged = finalOrderedNames.join(',') !== installedOrderedNames.filter(n => selectedSet.has(n)).join(',');
  const hasChanges = toInstall.length > 0 || toUninstall.length > 0 || orderChanged;

  if (!hasChanges) {
    console.log(chalk.green('No changes needed.'));
    return;
  }

  // Show summary and confirm
  if (toInstall.length > 0) {
    console.log(chalk.green(`\nWill install: ${toInstall.map(p => p.name).join(', ')}`));
  }
  if (toUninstall.length > 0) {
    console.log(chalk.red(`Will uninstall: ${toUninstall.map(p => p.name).join(', ')}`));
  }
  if (orderChanged) {
    console.log(chalk.cyan(`Load order: ${finalOrderedNames.join(' → ')}`));
  }

  if (!dryRun) {
    const proceed = await inquirerConfirm({ message: 'Proceed?', default: true });
    if (!proceed) {
      console.log('Cancelled.');
      return;
    }
  }

  // LINK-05: Conflict callback for install — prompts per-conflict
  const conflictCallback: ConflictCallback = async (targetPath) => {
    const relPath = path.relative(projectPath, targetPath);
    const overwrite = await inquirerConfirm({
      message: `File already exists: ${relPath}. Overwrite? (original backed up to .cla-backup)`,
      default: false,
    });
    return overwrite ? 'overwrite' : 'skip';
  };

  // Execute uninstalls first
  const errors: Array<{ pkg: string; err: Error }> = [];
  const allRemoved: string[] = [];
  for (const pkg of toUninstall) {
    try {
      const removed = await uninstallPackage(pkg, projectPath, { dryRun });
      allRemoved.push(...removed);
      console.log(chalk.red(`  Uninstalled ${pkg.name} (${removed.length} files removed)`));
    } catch (err) {
      errors.push({ pkg: pkg.name, err: err as Error });
      console.log(chalk.red(`  Failed to uninstall ${pkg.name}: ${(err as Error).message}`));
    }
  }

  // ROB-02: Clean empty directories after all uninstalls
  if (!dryRun && allRemoved.length > 0) {
    await cleanEmptyDirs(allRemoved, projectPath);
  }

  // ORD-03: Install ALL selected packages in order (bottom→top) so conflict resolution
  // reflects the final priority stack. installPackage is idempotent for correct symlinks.
  const symlinkCounts = new Map<string, number>();
  for (let i = 0; i < finalOrderedPkgs.length; i++) {
    const pkg = finalOrderedPkgs[i];
    try {
      const links = await installPackage(pkg, projectPath, conflictCallback, { dryRun });
      symlinkCounts.set(pkg.name, links.length);
      if (!dryRun) {
        await setPackageOrder(pkg, projectPath, i);
      }
    } catch (err) {
      errors.push({ pkg: pkg.name, err: err as Error });
      console.log(chalk.red(`  Failed to install ${pkg.name}: ${(err as Error).message}`));
    }
  }

  // Merge mergeable files (e.g. .md) across all selected packages
  const prevInstalledPkgs = packages.filter(pkg => installed.has(pkg.name));
  const mergedCounts = await mergeAll(finalOrderedPkgs, prevInstalledPkgs, projectPath, { dryRun });

  // Log installs with accurate total file count (symlinks + merged files)
  for (const pkg of toInstall) {
    const total = (symlinkCounts.get(pkg.name) ?? 0) + (mergedCounts.get(pkg.name) ?? 0);
    console.log(chalk.green(`  Installed ${pkg.name} (${total} files)`));
  }

  if (errors.length > 0) {
    console.error(chalk.red(`\n${errors.length} package(s) had errors.`));
  } else {
    console.log(chalk.green('\nDone.'));
  }
}
