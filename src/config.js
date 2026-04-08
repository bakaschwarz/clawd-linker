import path from 'path';
import os from 'os';
import chalk from 'chalk';
import { readFile, writeFile, rename, lstat } from './utils/fs.js';

export const CONFIG_PATH = path.join(os.homedir(), '.clawd-linker');

/**
 * Read the repo path from ~/.clawd-linker. Exits process with error if:
 * - Config file does not exist (CFG-02)
 * - Config file is not valid JSON (CFG-02)
 * - Configured repo path does not exist on disk (CFG-02)
 * @returns {Promise<string>} Absolute path to the package repository
 */
export async function getRepoPath() {
  let raw;
  try {
    const content = await readFile(CONFIG_PATH, 'utf8');
    raw = JSON.parse(content);
  } catch {
    console.error(chalk.red('No package repository configured. Run `clawd-linker init` first.'));
    process.exit(1);
  }

  if (raw.schemaVersion && raw.schemaVersion > 1) {
    console.warn(chalk.yellow(
      `Warning: config uses schema version ${raw.schemaVersion} (this tool supports version 1). Some settings may not be handled correctly.`
    ));
  }

  if (!raw.repoPath || typeof raw.repoPath !== 'string') {
    console.error(chalk.red('Config file is missing repoPath. Run `clawd-linker init` to reconfigure.'));
    process.exit(1);
  }

  // WR-03: access() succeeds on regular files too — use lstat + isDirectory()
  try {
    const st = await lstat(raw.repoPath);
    if (!st.isDirectory()) {
      throw new Error('not a directory');
    }
  } catch {
    console.error(chalk.red(`Package repo not found at ${raw.repoPath}. Run \`clawd-linker init\` to reconfigure.`));
    process.exit(1);
  }

  return raw.repoPath;
}

/**
 * Write the repo path to ~/.clawd-linker using atomic write (tmp + rename).
 * @param {string} repoPath - Absolute path to the package repository
 */
export async function setRepoPath(repoPath) {
  const resolved = path.resolve(repoPath);
  const data = JSON.stringify({ schemaVersion: 1, repoPath: resolved }, null, 2);
  const tmp = CONFIG_PATH + '.tmp';
  await writeFile(tmp, data, 'utf8');
  await rename(tmp, CONFIG_PATH);
}
