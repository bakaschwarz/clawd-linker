import { readdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { getRepoPath } from '../config.js';
import { listPackages } from '../services/package-registry.js';
import { getInstalledPackages } from '../services/package-state.js';

const SECTION_START = '# cla-linker managed — do not edit this block';
const SECTION_END = '# end cla-linker managed';

async function collectPackageFiles(filesPath: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(filesPath, { withFileTypes: true, recursive: true });
  for (const entry of entries) {
    if (entry.isFile()) {
      // entry.parentPath is available in Node 20+; fall back to entry.path for older versions
      const dir = (entry as { parentPath?: string; path?: string }).parentPath ?? (entry as { path?: string }).path ?? filesPath;
      results.push(path.join(dir, entry.name));
    }
  }
  return results;
}

function parseGitignore(content: string): { before: string[]; managed: string[]; after: string[] } {
  const lines = content.split('\n');
  const before: string[] = [];
  const managed: string[] = [];
  const after: string[] = [];

  let inBlock = false;
  let pastBlock = false;

  for (const line of lines) {
    if (!inBlock && !pastBlock && line === SECTION_START) {
      inBlock = true;
      continue;
    }
    if (inBlock && line === SECTION_END) {
      inBlock = false;
      pastBlock = true;
      continue;
    }
    if (inBlock) {
      managed.push(line);
    } else if (pastBlock) {
      after.push(line);
    } else {
      before.push(line);
    }
  }

  return { before, managed, after };
}

function buildGitignore(before: string[], managed: string[], after: string[]): string {
  const parts: string[] = [];

  const beforeBlock = before.join('\n').trimEnd();
  if (beforeBlock.length > 0) {
    parts.push(beforeBlock);
  }

  parts.push(SECTION_START);
  parts.push(...managed);
  parts.push(SECTION_END);

  const afterBlock = after.join('\n').trimEnd();
  if (afterBlock.length > 0) {
    parts.push(afterBlock);
  }

  return parts.join('\n') + '\n';
}

export async function ignoreCommand(): Promise<void> {
  const projectPath = path.resolve(process.cwd());
  const gitignorePath = path.join(projectPath, '.gitignore');

  const repoPath = await getRepoPath();
  const packages = await listPackages(repoPath);
  const installedNames = await getInstalledPackages(projectPath, packages);

  if (installedNames.size === 0) {
    console.log(chalk.yellow('No packages installed in this project.'));
    return;
  }

  // Collect all files from installed packages.
  // Files are installed at <projectPath>/<relativeToFilesPath>, mirroring the
  // package's files/ directory structure — same logic as symlink-manager.
  const relativePaths: string[] = [];
  for (const pkg of packages) {
    if (!installedNames.has(pkg.name)) continue;
    const files = await collectPackageFiles(pkg.filesPath);
    for (const abs of files) {
      relativePaths.push(path.relative(pkg.filesPath, abs));
    }
  }

  // Read existing .gitignore
  let existing = '';
  try {
    existing = await readFile(gitignorePath, 'utf8');
  } catch {
    // File doesn't exist yet — start fresh
  }

  const { before, managed, after } = parseGitignore(existing);

  // Determine which paths are already in the managed block
  const managedSet = new Set(managed.filter(l => l.trim() !== ''));
  const added: string[] = [];
  const skipped: string[] = [];

  for (const rel of relativePaths) {
    if (managedSet.has(rel)) {
      skipped.push(rel);
    } else {
      managedSet.add(rel);
      added.push(rel);
    }
  }

  const newManaged = [...managedSet].sort();
  await writeFile(gitignorePath, buildGitignore(before, newManaged, after), 'utf8');

  if (added.length > 0) {
    console.log(chalk.green(`Added ${added.length} entr${added.length === 1 ? 'y' : 'ies'} to .gitignore:`));
    for (const p of added) {
      console.log(`  ${chalk.cyan(p)}`);
    }
  }
  if (skipped.length > 0) {
    console.log(chalk.gray(`${skipped.length} entr${skipped.length === 1 ? 'y' : 'ies'} already present — skipped.`));
  }
  if (added.length === 0 && skipped.length === 0) {
    console.log(chalk.yellow('No package files found.'));
  }
}
