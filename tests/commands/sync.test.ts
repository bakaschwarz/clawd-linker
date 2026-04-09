import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, lstat, readlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeState } from '../../src/services/package-state.js';
import type { Package } from '../../src/types.js';

// Mock getRepoPath so tests don't need a real ~/.cla-linker config
vi.mock('../../src/config.js', () => ({
  getRepoPath: vi.fn(),
}));

import { getRepoPath } from '../../src/config.js';
import { syncCommand } from '../../src/commands/sync.js';

const mockGetRepoPath = vi.mocked(getRepoPath);

let tmpRoot: string;
let repoPath: string;
let projectDir: string;

function makePkg(name: string): Package {
  return {
    name,
    path: join(repoPath, name),
    filesPath: join(repoPath, name, 'files'),
    dataJsonPath: join(repoPath, name, 'data.json'),
  };
}

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'cl-sync-'));
  repoPath = join(tmpRoot, 'repo');
  projectDir = join(tmpRoot, 'project');
  await mkdir(repoPath, { recursive: true });
  await mkdir(projectDir, { recursive: true });
  mockGetRepoPath.mockResolvedValue(repoPath);
  vi.spyOn(process, 'cwd').mockReturnValue(projectDir);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(tmpRoot, { recursive: true, force: true });
});

async function setupPkg(name: string, files: string[] = ['a.ts']): Promise<Package> {
  const pkg = makePkg(name);
  await mkdir(pkg.filesPath, { recursive: true });
  for (const f of files) {
    await mkdir(join(pkg.filesPath, ...f.split('/').slice(0, -1)).replace(/\/$/, ''), { recursive: true }).catch(() => {});
    await writeFile(join(pkg.filesPath, f), `// ${f}`, 'utf8');
  }
  return pkg;
}

describe('syncCommand — local (default)', () => {
  it('prints a warning when no packages exist in the repo', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await syncCommand({});
    expect(log.mock.calls.flat().join(' ')).toMatch(/no packages found/i);
  });

  it('does nothing when no packages are installed in cwd', async () => {
    const pkg = await setupPkg('alpha');
    // data.json exists but has no installedIn entry for this project
    await writeState(pkg.dataJsonPath, { schemaVersion: 1, installedIn: {} });

    vi.spyOn(console, 'log').mockImplementation(() => {});
    await syncCommand({});

    // No symlinks should appear in projectDir
    const stat = await lstat(join(projectDir, 'a.ts')).catch(() => null);
    expect(stat).toBeNull();
  });

  it('re-creates a missing symlink for an installed package', async () => {
    const pkg = await setupPkg('alpha', ['a.ts']);
    // Simulate a previously installed state (symlink was there, then deleted)
    await writeState(pkg.dataJsonPath, {
      schemaVersion: 1,
      installedIn: { [projectDir]: [join(projectDir, 'a.ts')] },
    });

    vi.spyOn(console, 'log').mockImplementation(() => {});
    await syncCommand({});

    const target = join(projectDir, 'a.ts');
    const stat = await lstat(target);
    expect(stat.isSymbolicLink()).toBe(true);
    expect(await readlink(target)).toBe(join(pkg.filesPath, 'a.ts'));
  });

  it('creates symlinks for new files added to an installed package', async () => {
    const pkg = await setupPkg('alpha', ['a.ts']);
    // Package was installed with just a.ts
    await writeState(pkg.dataJsonPath, {
      schemaVersion: 1,
      installedIn: { [projectDir]: [join(projectDir, 'a.ts')] },
    });
    // Now a new file b.ts was added to the package
    await writeFile(join(pkg.filesPath, 'b.ts'), '// b', 'utf8');

    vi.spyOn(console, 'log').mockImplementation(() => {});
    await syncCommand({});

    const statB = await lstat(join(projectDir, 'b.ts'));
    expect(statB.isSymbolicLink()).toBe(true);
  });

  it('does not sync a project that is not cwd when --global is not set', async () => {
    const otherProject = join(tmpRoot, 'other');
    await mkdir(otherProject, { recursive: true });

    const pkg = await setupPkg('alpha', ['a.ts']);
    await writeState(pkg.dataJsonPath, {
      schemaVersion: 1,
      installedIn: {
        [projectDir]: [join(projectDir, 'a.ts')],
        [otherProject]: [join(otherProject, 'a.ts')],
      },
    });

    vi.spyOn(console, 'log').mockImplementation(() => {});
    await syncCommand({});

    // otherProject should not get a symlink (local scope)
    const otherStat = await lstat(join(otherProject, 'a.ts')).catch(() => null);
    expect(otherStat).toBeNull();
  });

  it('does not overwrite a real file that conflicts (auto-skip)', async () => {
    const pkg = await setupPkg('alpha', ['a.ts']);
    await writeState(pkg.dataJsonPath, {
      schemaVersion: 1,
      installedIn: { [projectDir]: [] }, // previously installed, no recorded links
    });
    // User has a real file where the symlink would go
    const target = join(projectDir, 'a.ts');
    await writeFile(target, 'user content', 'utf8');

    vi.spyOn(console, 'log').mockImplementation(() => {});
    await syncCommand({});

    const stat = await lstat(target);
    expect(stat.isSymbolicLink()).toBe(false);
    expect(await import('fs/promises').then(m => m.readFile(target, 'utf8'))).toBe('user content');
  });
});

describe('syncCommand — global (-g)', () => {
  it('syncs all registered projects across all packages', async () => {
    const projectA = join(tmpRoot, 'projA');
    const projectB = join(tmpRoot, 'projB');
    await mkdir(projectA, { recursive: true });
    await mkdir(projectB, { recursive: true });

    const pkg = await setupPkg('alpha', ['a.ts']);
    await writeState(pkg.dataJsonPath, {
      schemaVersion: 1,
      installedIn: {
        [projectA]: [join(projectA, 'a.ts')],
        [projectB]: [join(projectB, 'a.ts')],
      },
    });

    vi.spyOn(console, 'log').mockImplementation(() => {});
    await syncCommand({ global: true });

    const statA = await lstat(join(projectA, 'a.ts'));
    const statB = await lstat(join(projectB, 'a.ts'));
    expect(statA.isSymbolicLink()).toBe(true);
    expect(statB.isSymbolicLink()).toBe(true);
  });

  it('syncs multiple packages across multiple projects', async () => {
    const projX = join(tmpRoot, 'projX');
    await mkdir(projX, { recursive: true });

    const pkgA = await setupPkg('alpha', ['alpha.ts']);
    const pkgB = await setupPkg('beta', ['beta.ts']);

    await writeState(pkgA.dataJsonPath, {
      schemaVersion: 1,
      installedIn: { [projX]: [join(projX, 'alpha.ts')] },
    });
    await writeState(pkgB.dataJsonPath, {
      schemaVersion: 1,
      installedIn: { [projX]: [join(projX, 'beta.ts')] },
    });

    vi.spyOn(console, 'log').mockImplementation(() => {});
    await syncCommand({ global: true });

    expect((await lstat(join(projX, 'alpha.ts'))).isSymbolicLink()).toBe(true);
    expect((await lstat(join(projX, 'beta.ts'))).isSymbolicLink()).toBe(true);
  });
});
