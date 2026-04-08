import path from 'path';
import chalk from 'chalk';
import { mkdir, writeFile, access } from '../utils/fs.js';
import { getRepoPath } from '../config.js';

/**
 * `clawd-linker new <name>` command handler.
 * Scaffolds a new package in the repository with:
 * - <name>/files/          (directory for symlinked files)
 * - <name>/PACKAGE.md      (package documentation)
 * - <name>/data.json       (state tracking — gitignored)
 * - <name>/.gitignore      (gitignores data.json — PKG-02)
 * @param {string} name - Package name from CLI argument
 */
export async function newCommand(name) {
  if (!name) {
    console.error(chalk.red('Package name is required. Usage: clawd-linker new <name>'));
    process.exit(1);
  }

  const repoPath = await getRepoPath(); // Exits if not configured (CFG-02)

  // Security: prevent path traversal — CR-01
  if (name.includes('/') || name.includes('\\') || name.includes('..')) {
    console.error(chalk.red(`Package name must not contain path separators or ".."`));
    process.exit(1);
  }

  const pkgPath = path.join(repoPath, name);
  const filesPath = path.join(pkgPath, 'files');

  // Check if package already exists
  try {
    await access(pkgPath);
    console.error(chalk.red(`Package "${name}" already exists at: ${pkgPath}`));
    process.exit(1);
  } catch {
    // Does not exist — proceed
  }

  // PKG-01: Create directory structure
  await mkdir(filesPath, { recursive: true });

  // PKG-01: Create PACKAGE.md
  await writeFile(
    path.join(pkgPath, 'PACKAGE.md'),
    `# ${name}\n\nDescribe this package and what files it provides.\n`,
    'utf8'
  );

  // PKG-01: Create initial data.json (empty state)
  await writeFile(
    path.join(pkgPath, 'data.json'),
    JSON.stringify({ schemaVersion: 1, installedIn: {} }, null, 2),
    'utf8'
  );

  // PKG-02: Create .gitignore that ignores data.json
  await writeFile(
    path.join(pkgPath, '.gitignore'),
    'data.json\n',
    'utf8'
  );

  console.log(chalk.green(`Package "${name}" created at: ${pkgPath}`));
  console.log('');
  console.log(`Add files to ${chalk.cyan(filesPath)} then run ${chalk.cyan('clawd-linker manage')} in a project.`);
}
