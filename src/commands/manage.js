import path from 'path';
import chalk from 'chalk';
import { checkbox, confirm as inquirerConfirm } from '@inquirer/prompts';
import { getRepoPath } from '../config.js';
import { listPackages } from '../services/package-registry.js';
import { getInstalledPackages } from '../services/package-state.js';
import { installPackage, uninstallPackage } from '../services/symlink-manager.js';

/**
 * `clawd-linker manage` (alias `m`) command handler.
 * Opens interactive checkbox list of all packages, pre-checks installed ones,
 * then installs/uninstalls based on diff between current and selected state.
 */
export async function manageCommand() {
  const repoPath = await getRepoPath(); // Exits if not configured (CFG-02)
  const projectPath = path.resolve(process.cwd());
  const packages = await listPackages(repoPath);

  if (packages.length === 0) {
    console.log(chalk.yellow('No packages found in the repository.'));
    console.log(`Create one with: ${chalk.cyan('clawd-linker new <name>')}`);
    return;
  }

  // MGR-02: Determine which packages are currently installed
  const installed = await getInstalledPackages(projectPath, packages);

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

  const proceed = await inquirerConfirm({ message: 'Proceed?', default: true });
  if (!proceed) {
    console.log('Cancelled.');
    return;
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

  // Execute installs
  for (const pkg of toInstall) {
    const links = await installPackage(pkg, projectPath, conflictCallback);
    console.log(chalk.green(`  Installed ${pkg.name} (${links.length} files)`));
  }

  // Execute uninstalls
  for (const pkg of toUninstall) {
    const removed = await uninstallPackage(pkg, projectPath);
    console.log(chalk.red(`  Uninstalled ${pkg.name} (${removed.length} files removed)`));
  }

  console.log(chalk.green('\nDone.'));
}
