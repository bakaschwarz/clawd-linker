import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { listPackages } from '../../src/services/package-registry.js';

let repoDir: string;

beforeEach(async () => {
  repoDir = await mkdtemp(join(tmpdir(), 'cl-reg-'));
});

afterEach(async () => {
  await rm(repoDir, { recursive: true, force: true });
});

async function makePackage(name: string) {
  const pkgDir = join(repoDir, name);
  await mkdir(join(pkgDir, 'files'), { recursive: true });
  return pkgDir;
}

describe('listPackages', () => {
  it('returns packages whose directories contain a files/ subdirectory', async () => {
    await makePackage('my-pkg');

    const result = await listPackages(repoDir);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('my-pkg');
    expect(result[0].filesPath).toBe(join(repoDir, 'my-pkg', 'files'));
    expect(result[0].dataJsonPath).toBe(join(repoDir, 'my-pkg', 'data.json'));
  });

  it('skips directories without a files/ subdirectory', async () => {
    await mkdir(join(repoDir, 'no-files-dir'));

    const result = await listPackages(repoDir);
    expect(result).toHaveLength(0);
  });

  it('skips dot-directories', async () => {
    await mkdir(join(repoDir, '.git', 'files'), { recursive: true });
    await makePackage('real-pkg');

    const result = await listPackages(repoDir);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('real-pkg');
  });

  it('returns packages sorted alphabetically', async () => {
    await makePackage('zebra');
    await makePackage('alpha');
    await makePackage('middle');

    const result = await listPackages(repoDir);
    expect(result.map(p => p.name)).toEqual(['alpha', 'middle', 'zebra']);
  });

  it('skips entries where files exists but is a file, not a directory', async () => {
    const pkgDir = join(repoDir, 'bad-pkg');
    await mkdir(pkgDir);
    await writeFile(join(pkgDir, 'files'), ''); // file, not directory

    const result = await listPackages(repoDir);
    expect(result).toHaveLength(0);
  });

  it('returns empty array when repo directory is empty', async () => {
    const result = await listPackages(repoDir);
    expect(result).toHaveLength(0);
  });
});
