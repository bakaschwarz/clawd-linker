import path from 'path';
import chalk from 'chalk';
import { checkbox, confirm as inquirerConfirm } from '@inquirer/prompts';
import { getRepoPath } from '../config.js';
import { listPackages } from '../services/package-registry.js';
import { getInstalledPackages, reconcileLinks } from '../services/package-state.js';
import { installPackage, uninstallPackage, cleanEmptyDirs } from '../services/symlink-manager.js';

/**
 * `clawd-linker manage` (alias `m`) command handler.
 * Opens interactive checkbox list of all packages, pre-checks installed ones,
 * then installs/uninstalls based on diff between current and selected state.
 *
 * @param {object} options - Commander options
 * @param {boolean} [options.dryRun] - Preview changes without filesystem modifications
 * @param {boolean} [options.yes] - Skip interactive prompts (headless mode)
 */
export async function manageCommand(options) {
  const dryRun = options.dryRun || false;
  const isHeadless = options.yes || !process.stdin.isTTY;

  const repoPath = await getRepoPath(); // Exits if not configured (CFG-02)
  const projectPath = path.resolve(process.cwd());
  const packages = await listPackages(repoPath);

  if (packages.length === 0) {
    console.log(chalk.yellow('No packages found in the repository.'));
    console.log(`Create one with: ${chalk.cyan('clawd-linker new <name>')}`);
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

  // MGR-02: Determine which packages are currently installed
  const installed = await getInstalledPackages(projectPath, packages);

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

  if (toInstall.length === 0 && toUninstall.length === 0) {
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

  if (!dryRun) {
    const proceed = await inquirerConfirm({ message: 'Proceed?', default: true });
    if (!proceed) {
      console.log('Cancelled.');
      return;
    }
  }

  // LINK-05: Conflict callback for install — prompts per-conflict
  const conflictCallback = async (targetPath) => {
    const relPath = path.relative(projectPath, targetPath);
    const overwrite = await inquirerConfirm({
      message: `File already exists: ${relPath}. Overwrite? (original backed up to .clawd-backup)`,
      default: false,
    });
    return overwrite ? 'overwrite' : 'skip';
  };

  // Execute installs — WR-02: accumulate errors rather than letting them propagate
  const errors = [];
  for (const pkg of toInstall) {
    try {
      const links = await installPackage(pkg, projectPath, conflictCallback, { dryRun });
      console.log(chalk.green(`  Installed ${pkg.name} (${links.length} files)`));
    } catch (err) {
      errors.push({ pkg: pkg.name, err });
      console.log(chalk.red(`  Failed to install ${pkg.name}: ${err.message}`));
    }
  }

  // Execute uninstalls
  const allRemoved = [];
  for (const pkg of toUninstall) {
    try {
      const removed = await uninstallPackage(pkg, projectPath, { dryRun });
      allRemoved.push(...removed);
      console.log(chalk.red(`  Uninstalled ${pkg.name} (${removed.length} files removed)`));
    } catch (err) {
      errors.push({ pkg: pkg.name, err });
      console.log(chalk.red(`  Failed to uninstall ${pkg.name}: ${err.message}`));
    }
  }

  // ROB-02: Clean empty directories after all uninstalls
  if (!dryRun && allRemoved.length > 0) {
    await cleanEmptyDirs(allRemoved, projectPath);
  }

  if (errors.length > 0) {
    console.error(chalk.red(`\n${errors.length} package(s) had errors.`));
  } else {
    console.log(chalk.green('\nDone.'));
  }
}
