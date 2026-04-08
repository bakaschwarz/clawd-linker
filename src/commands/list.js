import path from 'path';
import chalk from 'chalk';
import { getRepoPath } from '../config.js';
import { listPackages } from '../services/package-registry.js';
import { getInstalledPackages } from '../services/package-state.js';

/**
 * `clawd-linker list` command handler.
 * Shows installed packages for the current project without opening the TUI.
 */
export async function listCommand() {
  const repoPath = await getRepoPath();
  const projectPath = path.resolve(process.cwd());
  const packages = await listPackages(repoPath);

  if (packages.length === 0) {
    console.log(chalk.yellow('No packages found in the repository.'));
    return;
  }

  const installed = await getInstalledPackages(projectPath, packages);

  if (installed.size === 0) {
    console.log(chalk.yellow('No packages installed in this project.'));
    return;
  }

  console.log(chalk.bold(`Installed packages in ${projectPath}:\n`));
  for (const pkg of packages) {
    if (installed.has(pkg.name)) {
      console.log(chalk.green(`  ✓ ${pkg.name}`));
    }
  }
  console.log('');
}
