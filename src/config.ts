import { readFile, writeFile, rename, lstat } from 'fs/promises';
import path from 'path';
import os from 'os';
import chalk from 'chalk';

export const CONFIG_PATH = path.join(os.homedir(), '.clawd-linker');

interface RawConfig {
  schemaVersion?: number;
  repoPath?: unknown;
}

export async function getRepoPath(configPath = CONFIG_PATH): Promise<string> {
  let raw: RawConfig;
  try {
    const content = await readFile(configPath, 'utf8');
    raw = JSON.parse(content) as RawConfig;
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

  const repoPath = raw.repoPath;

  // WR-03: access() succeeds on regular files too — use lstat + isDirectory()
  try {
    const st = await lstat(repoPath);
    if (!st.isDirectory()) {
      throw new Error('not a directory');
    }
  } catch {
    console.error(chalk.red(`Package repo not found at ${repoPath}. Run \`clawd-linker init\` to reconfigure.`));
    process.exit(1);
  }

  return repoPath;
}

export async function setRepoPath(repoPath: string, configPath = CONFIG_PATH): Promise<void> {
  const resolved = path.resolve(repoPath);
  const data = JSON.stringify({ schemaVersion: 1, repoPath: resolved }, null, 2);
  const tmp = configPath + '.tmp';
  await writeFile(tmp, data, 'utf8');
  await rename(tmp, configPath);
}
