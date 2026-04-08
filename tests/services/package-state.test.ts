import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, symlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { readState, writeState, getInstalledPackages, reconcileLinks } from '../../src/services/package-state.js';
import type { Package } from '../../src/types.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cl-state-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function makePkg(name: string, pkgDir: string): Package {
  return {
    name,
    path: pkgDir,
    filesPath: join(pkgDir, 'files'),
    dataJsonPath: join(pkgDir, 'data.json'),
  };
}

describe('readState', () => {
  it('returns default shape when file is missing', async () => {
    const result = await readState(join(dir, 'nonexistent.json'));
    expect(result).toEqual({ schemaVersion: 1, installedIn: {} });
  });

  it('returns default shape when file has invalid JSON', async () => {
    const p = join(dir, 'data.json');
    await writeFile(p, 'not json', 'utf8');
    const result = await readState(p);
    expect(result).toEqual({ schemaVersion: 1, installedIn: {} });
  });

  it('returns default shape when installedIn is missing', async () => {
    const p = join(dir, 'data.json');
    await writeFile(p, JSON.stringify({ schemaVersion: 1 }), 'utf8');
    const result = await readState(p);
    expect(result).toEqual({ schemaVersion: 1, installedIn: {} });
  });

  it('returns parsed state for a valid data.json', async () => {
    const p = join(dir, 'data.json');
    const state = { schemaVersion: 1, installedIn: { '/proj': ['/proj/a.txt'] } };
    await writeFile(p, JSON.stringify(state), 'utf8');
    const result = await readState(p);
    expect(result).toEqual(state);
  });
});

describe('writeState', () => {
  it('writes atomically and content is readable by readState', async () => {
    const p = join(dir, 'data.json');
    const state = { schemaVersion: 1 as const, installedIn: { '/proj': ['/proj/x.ts'] } };
    await writeState(p, state);
    const result = await readState(p);
    expect(result).toEqual(state);
  });
});

describe('getInstalledPackages', () => {
  it('returns names of packages that have entries for the project path', async () => {
    const pkgDir = join(dir, 'pkg-a');
    await mkdir(join(pkgDir, 'files'), { recursive: true });
    const pkg = makePkg('pkg-a', pkgDir);
    const projectPath = '/some/project';
    await writeState(pkg.dataJsonPath, {
      schemaVersion: 1,
      installedIn: { [projectPath]: [join(projectPath, 'file.ts')] },
    });

    const result = await getInstalledPackages(projectPath, [pkg]);
    expect(result).toEqual(new Set(['pkg-a']));
  });

  it('excludes packages not recorded for the project path', async () => {
    const pkgDir = join(dir, 'pkg-b');
    await mkdir(join(pkgDir, 'files'), { recursive: true });
    const pkg = makePkg('pkg-b', pkgDir);
    // no data.json written → missing file → default empty state

    const result = await getInstalledPackages('/some/project', [pkg]);
    expect(result).toEqual(new Set());
  });

  it('excludes packages with empty link arrays', async () => {
    const pkgDir = join(dir, 'pkg-c');
    await mkdir(join(pkgDir, 'files'), { recursive: true });
    const pkg = makePkg('pkg-c', pkgDir);
    const projectPath = '/some/project';
    await writeState(pkg.dataJsonPath, {
      schemaVersion: 1,
      installedIn: { [projectPath]: [] },
    });

    const result = await getInstalledPackages(projectPath, [pkg]);
    expect(result).toEqual(new Set());
  });
});

describe('reconcileLinks', () => {
  let projectDir: string;
  let pkgDir: string;
  let pkg: Package;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'cl-proj-'));
    pkgDir = join(dir, 'pkg');
    await mkdir(join(pkgDir, 'files'), { recursive: true });
    pkg = makePkg('pkg', pkgDir);
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  it('returns pruned: 0 when no links recorded', async () => {
    const result = await reconcileLinks(pkg, projectDir);
    expect(result).toEqual({ pruned: 0 });
  });

  it('prunes missing symlinks from state', async () => {
    const linkPath = join(projectDir, 'gone.ts');
    await writeState(pkg.dataJsonPath, {
      schemaVersion: 1,
      installedIn: { [projectDir]: [linkPath] },
    });

    const result = await reconcileLinks(pkg, projectDir);
    expect(result).toEqual({ pruned: 1 });

    const state = await readState(pkg.dataJsonPath);
    expect(state.installedIn[projectDir]).toBeUndefined();
  });

  it('prunes entries that are real files (not symlinks)', async () => {
    const filePath = join(projectDir, 'real.ts');
    await writeFile(filePath, 'content', 'utf8');
    await writeState(pkg.dataJsonPath, {
      schemaVersion: 1,
      installedIn: { [projectDir]: [filePath] },
    });

    const result = await reconcileLinks(pkg, projectDir);
    expect(result).toEqual({ pruned: 1 });
  });

  it('prunes symlinks pointing to the wrong target', async () => {
    const linkPath = join(projectDir, 'file.ts');
    await symlink('/some/other/path', linkPath);
    await writeState(pkg.dataJsonPath, {
      schemaVersion: 1,
      installedIn: { [projectDir]: [linkPath] },
    });

    const result = await reconcileLinks(pkg, projectDir);
    expect(result).toEqual({ pruned: 1 });
  });

  it('keeps valid symlinks pointing to the correct source', async () => {
    const srcFile = join(pkgDir, 'files', 'file.ts');
    await writeFile(srcFile, '', 'utf8');
    const linkPath = join(projectDir, 'file.ts');
    await symlink(srcFile, linkPath);

    await writeState(pkg.dataJsonPath, {
      schemaVersion: 1,
      installedIn: { [projectDir]: [linkPath] },
    });

    const result = await reconcileLinks(pkg, projectDir);
    expect(result).toEqual({ pruned: 0 });

    const state = await readState(pkg.dataJsonPath);
    expect(state.installedIn[projectDir]).toContain(linkPath);
  });

  it('prunes paths that escape the project root', async () => {
    const escapingPath = join(dir, 'outside.ts'); // outside projectDir
    await writeState(pkg.dataJsonPath, {
      schemaVersion: 1,
      installedIn: { [projectDir]: [escapingPath] },
    });

    const result = await reconcileLinks(pkg, projectDir);
    expect(result).toEqual({ pruned: 1 });
  });

  it('deletes the project entry entirely when all links are stale', async () => {
    const linkPath = join(projectDir, 'missing.ts');
    await writeState(pkg.dataJsonPath, {
      schemaVersion: 1,
      installedIn: { [projectDir]: [linkPath] },
    });

    await reconcileLinks(pkg, projectDir);

    const state = await readState(pkg.dataJsonPath);
    expect(state.installedIn).not.toHaveProperty(projectDir);
  });
});
