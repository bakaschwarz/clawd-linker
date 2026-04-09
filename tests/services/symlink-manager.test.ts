import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readlink, lstat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { installPackage, uninstallPackage, cleanEmptyDirs } from '../../src/services/symlink-manager.js';
import { readState } from '../../src/services/package-state.js';
import type { Package } from '../../src/types.js';

let tmpRoot: string;
let pkgDir: string;
let projectDir: string;
let pkg: Package;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'cl-sym-'));
  pkgDir = join(tmpRoot, 'pkg');
  projectDir = join(tmpRoot, 'project');
  await mkdir(join(pkgDir, 'files'), { recursive: true });
  await mkdir(projectDir, { recursive: true });
  pkg = {
    name: 'pkg',
    path: pkgDir,
    filesPath: join(pkgDir, 'files'),
    dataJsonPath: join(pkgDir, 'data.json'),
  };
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

const noConflict = vi.fn().mockResolvedValue('skip');

describe('installPackage', () => {
  it('creates symlinks for all files in pkg.filesPath', async () => {
    await writeFile(join(pkg.filesPath, 'a.ts'), '', 'utf8');

    await installPackage(pkg, projectDir, noConflict);

    const target = join(projectDir, 'a.ts');
    const stat = await lstat(target);
    expect(stat.isSymbolicLink()).toBe(true);
    const dest = await readlink(target);
    expect(dest).toBe(join(pkg.filesPath, 'a.ts'));
  });

  it('creates missing parent directories', async () => {
    await mkdir(join(pkg.filesPath, 'sub'));
    await writeFile(join(pkg.filesPath, 'sub', 'b.ts'), '', 'utf8');

    await installPackage(pkg, projectDir, noConflict);

    const stat = await lstat(join(projectDir, 'sub', 'b.ts'));
    expect(stat.isSymbolicLink()).toBe(true);
  });

  it('is idempotent — calling twice keeps correct symlinks', async () => {
    await writeFile(join(pkg.filesPath, 'c.ts'), '', 'utf8');

    await installPackage(pkg, projectDir, noConflict);
    await installPackage(pkg, projectDir, noConflict);

    const stat = await lstat(join(projectDir, 'c.ts'));
    expect(stat.isSymbolicLink()).toBe(true);
  });

  it('replaces a wrong-target symlink with the correct one', async () => {
    await writeFile(join(pkg.filesPath, 'd.ts'), '', 'utf8');
    const target = join(projectDir, 'd.ts');
    const { symlink } = await import('fs/promises');
    await symlink('/wrong/target', target);

    await installPackage(pkg, projectDir, noConflict);

    const dest = await readlink(target);
    expect(dest).toBe(join(pkg.filesPath, 'd.ts'));
  });

  it('calls conflictCallback and skips when action is skip', async () => {
    await writeFile(join(pkg.filesPath, 'e.ts'), '', 'utf8');
    const target = join(projectDir, 'e.ts');
    await writeFile(target, 'original', 'utf8'); // real file conflict

    const skipCb = vi.fn().mockResolvedValue('skip');
    await installPackage(pkg, projectDir, skipCb);

    expect(skipCb).toHaveBeenCalledWith(target);
    // file should still be a regular file, not a symlink
    const stat = await lstat(target);
    expect(stat.isSymbolicLink()).toBe(false);
  });

  it('calls conflictCallback and backs up original when action is overwrite', async () => {
    await writeFile(join(pkg.filesPath, 'f.ts'), '', 'utf8');
    const target = join(projectDir, 'f.ts');
    await writeFile(target, 'original content', 'utf8');

    const overwriteCb = vi.fn().mockResolvedValue('overwrite');
    await installPackage(pkg, projectDir, overwriteCb);

    const stat = await lstat(target);
    expect(stat.isSymbolicLink()).toBe(true);

    const backup = await lstat(target + '.cla-backup');
    expect(backup.isFile()).toBe(true);
  });

  it('records owned links in data.json', async () => {
    await writeFile(join(pkg.filesPath, 'g.ts'), '', 'utf8');

    await installPackage(pkg, projectDir, noConflict);

    const state = await readState(pkg.dataJsonPath);
    expect(state.installedIn[projectDir]).toContain(join(projectDir, 'g.ts'));
  });

  it('skips mergeable (.md) files — leaves no symlink and no state entry', async () => {
    await writeFile(join(pkg.filesPath, 'README.md'), '# hello', 'utf8');
    await writeFile(join(pkg.filesPath, 'a.ts'), '', 'utf8');

    const links = await installPackage(pkg, projectDir, noConflict);

    // .md file must not appear as a symlink
    const mdStat = await lstat(join(projectDir, 'README.md')).catch(() => null);
    expect(mdStat).toBeNull();

    // .ts file is still linked
    expect(links).toContain(join(projectDir, 'a.ts'));

    // data.json must not contain the .md path
    const state = await readState(pkg.dataJsonPath);
    expect(state.installedIn[projectDir]).not.toContain(join(projectDir, 'README.md'));
  });

  it('with dryRun: true does not create symlinks or modify state', async () => {
    await writeFile(join(pkg.filesPath, 'h.ts'), '', 'utf8');

    await installPackage(pkg, projectDir, noConflict, { dryRun: true });

    const target = join(projectDir, 'h.ts');
    const stat = await lstat(target).catch(() => null);
    expect(stat).toBeNull();

    const state = await readState(pkg.dataJsonPath);
    expect(state.installedIn[projectDir]).toBeUndefined();
  });
});

describe('uninstallPackage', () => {
  async function install(filename: string) {
    await writeFile(join(pkg.filesPath, filename), '', 'utf8');
    await installPackage(pkg, projectDir, noConflict);
  }

  it('removes symlinks recorded in state', async () => {
    await install('i.ts');
    const target = join(projectDir, 'i.ts');

    await uninstallPackage(pkg, projectDir);

    const stat = await lstat(target).catch(() => null);
    expect(stat).toBeNull();
  });

  it('removes the project entry from data.json', async () => {
    await install('j.ts');

    await uninstallPackage(pkg, projectDir);

    const state = await readState(pkg.dataJsonPath);
    expect(state.installedIn).not.toHaveProperty(projectDir);
  });

  it('skips entries that are no longer symlinks', async () => {
    await install('k.ts');
    const target = join(projectDir, 'k.ts');
    // Replace symlink with a real file
    const { unlink } = await import('fs/promises');
    await unlink(target);
    await writeFile(target, 'real', 'utf8');

    // Should not throw
    const removed = await uninstallPackage(pkg, projectDir);
    expect(removed).not.toContain(target);
  });

  it('with dryRun: true does not remove symlinks or modify state', async () => {
    await install('l.ts');
    const target = join(projectDir, 'l.ts');

    await uninstallPackage(pkg, projectDir, { dryRun: true });

    const stat = await lstat(target);
    expect(stat.isSymbolicLink()).toBe(true);

    const state = await readState(pkg.dataJsonPath);
    expect(state.installedIn[projectDir]).toBeDefined();
  });
});

describe('cleanEmptyDirs', () => {
  it('removes directories that become empty after symlink removal', async () => {
    const subDir = join(projectDir, 'sub');
    await mkdir(subDir);
    const removedPath = join(subDir, 'removed.ts');

    await cleanEmptyDirs([removedPath], projectDir);

    const stat = await lstat(subDir).catch(() => null);
    expect(stat).toBeNull();
  });

  it('does not remove non-empty directories', async () => {
    const subDir = join(projectDir, 'sub');
    await mkdir(subDir);
    await writeFile(join(subDir, 'keep.ts'), '', 'utf8');

    await cleanEmptyDirs([join(subDir, 'removed.ts')], projectDir);

    const stat = await lstat(subDir).catch(() => null);
    expect(stat).not.toBeNull();
  });

  it('does not remove the project root itself', async () => {
    // No subdirs — only a file directly in projectDir
    await cleanEmptyDirs([join(projectDir, 'file.ts')], projectDir);

    const stat = await lstat(projectDir).catch(() => null);
    expect(stat).not.toBeNull();
  });

  it('removes nested empty directories deepest-first', async () => {
    const a = join(projectDir, 'a');
    const ab = join(a, 'b');
    await mkdir(ab, { recursive: true });

    await cleanEmptyDirs([join(ab, 'removed.ts')], projectDir);

    expect(await lstat(ab).catch(() => null)).toBeNull();
    expect(await lstat(a).catch(() => null)).toBeNull();
  });
});
