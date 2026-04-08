import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, symlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { walkFiles } from '../../src/utils/fs.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cl-fs-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('walkFiles', () => {
  it('returns relative paths for regular files recursively', async () => {
    await mkdir(join(dir, 'sub'));
    await writeFile(join(dir, 'a.txt'), '');
    await writeFile(join(dir, 'sub', 'b.txt'), '');

    const result = await walkFiles(dir);
    expect(result.sort()).toEqual(['a.txt', join('sub', 'b.txt')]);
  });

  it('returns an empty array for an empty directory', async () => {
    const result = await walkFiles(dir);
    expect(result).toEqual([]);
  });

  it('excludes symlinks', async () => {
    const target = join(dir, 'real.txt');
    const link = join(dir, 'link.txt');
    await writeFile(target, '');
    await symlink(target, link);

    const result = await walkFiles(dir);
    expect(result).toEqual(['real.txt']);
  });

  it('excludes directories', async () => {
    await mkdir(join(dir, 'sub'));
    await writeFile(join(dir, 'sub', 'file.txt'), '');

    const result = await walkFiles(dir);
    expect(result).toEqual([join('sub', 'file.txt')]);
  });
});
