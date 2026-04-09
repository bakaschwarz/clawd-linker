import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, lstat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { mergeAll, isMergeable, USER_SECTION_MARKER } from '../../src/services/merge-manager.js';
import type { Package } from '../../src/types.js';

let tmpRoot: string;
let projectDir: string;

function makePkg(name: string, pkgDir: string): Package {
  return {
    name,
    path: pkgDir,
    filesPath: join(pkgDir, 'files'),
    dataJsonPath: join(pkgDir, 'data.json'),
  };
}

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'cl-merge-'));
  projectDir = join(tmpRoot, 'project');
  await mkdir(projectDir, { recursive: true });
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

describe('isMergeable', () => {
  it('returns true for .md files', () => {
    expect(isMergeable('CLAUDE.md')).toBe(true);
    expect(isMergeable('docs/guide.md')).toBe(true);
    expect(isMergeable('README.MD')).toBe(true); // case-insensitive
  });

  it('returns false for other extensions', () => {
    expect(isMergeable('index.ts')).toBe(false);
    expect(isMergeable('script.sh')).toBe(false);
    expect(isMergeable('file')).toBe(false);
  });
});

describe('mergeAll', () => {
  it('writes merged content from two packages in order', async () => {
    const pkgA = makePkg('a', join(tmpRoot, 'a'));
    const pkgB = makePkg('b', join(tmpRoot, 'b'));
    await mkdir(pkgA.filesPath, { recursive: true });
    await mkdir(pkgB.filesPath, { recursive: true });
    await writeFile(join(pkgA.filesPath, 'CLAUDE.md'), '# Package A', 'utf8');
    await writeFile(join(pkgB.filesPath, 'CLAUDE.md'), '# Package B', 'utf8');

    await mergeAll([pkgA, pkgB], [], projectDir);

    const result = await readFile(join(projectDir, 'CLAUDE.md'), 'utf8');
    const markerIdx = result.indexOf(USER_SECTION_MARKER);
    expect(markerIdx).toBeGreaterThan(-1);
    const managed = result.slice(0, markerIdx);
    expect(managed).toContain('# Package A');
    expect(managed).toContain('# Package B');
    // A comes before B
    expect(managed.indexOf('# Package A')).toBeLessThan(managed.indexOf('# Package B'));
  });

  it('appends user section marker and empty user area on first write', async () => {
    const pkg = makePkg('a', join(tmpRoot, 'a'));
    await mkdir(pkg.filesPath, { recursive: true });
    await writeFile(join(pkg.filesPath, 'CLAUDE.md'), '# Hello', 'utf8');

    await mergeAll([pkg], [], projectDir);

    const result = await readFile(join(projectDir, 'CLAUDE.md'), 'utf8');
    expect(result).toContain(USER_SECTION_MARKER);
  });

  it('preserves user content below the marker on rebuild', async () => {
    const pkg = makePkg('a', join(tmpRoot, 'a'));
    await mkdir(pkg.filesPath, { recursive: true });
    await writeFile(join(pkg.filesPath, 'CLAUDE.md'), '# Managed', 'utf8');

    // First run — creates merged file
    await mergeAll([pkg], [], projectDir);

    // User adds content below the marker
    const after = await readFile(join(projectDir, 'CLAUDE.md'), 'utf8');
    await writeFile(join(projectDir, 'CLAUDE.md'), after + 'My custom line\n', 'utf8');

    // Second run — should preserve user content
    await mergeAll([pkg], [pkg], projectDir);

    const result = await readFile(join(projectDir, 'CLAUDE.md'), 'utf8');
    expect(result).toContain('My custom line');
    expect(result).toContain('# Managed');
  });

  it('treats existing file without marker as user content (pushes it below marker)', async () => {
    const pkg = makePkg('a', join(tmpRoot, 'a'));
    await mkdir(pkg.filesPath, { recursive: true });
    await writeFile(join(pkg.filesPath, 'CLAUDE.md'), '# Managed', 'utf8');

    // Pre-existing file with no marker
    await writeFile(join(projectDir, 'CLAUDE.md'), 'Pre-existing content\n', 'utf8');

    await mergeAll([pkg], [], projectDir);

    const result = await readFile(join(projectDir, 'CLAUDE.md'), 'utf8');
    const markerIdx = result.indexOf(USER_SECTION_MARKER);
    expect(markerIdx).toBeGreaterThan(-1);
    expect(result.slice(0, markerIdx)).toContain('# Managed');
    expect(result.slice(markerIdx)).toContain('Pre-existing content');
  });

  it('strips managed content and keeps user section when all packages deselected (user section non-empty)', async () => {
    const pkg = makePkg('a', join(tmpRoot, 'a'));
    await mkdir(pkg.filesPath, { recursive: true });
    await writeFile(join(pkg.filesPath, 'CLAUDE.md'), '# Managed', 'utf8');

    await mergeAll([pkg], [], projectDir);

    // Add user content
    const after = await readFile(join(projectDir, 'CLAUDE.md'), 'utf8');
    await writeFile(join(projectDir, 'CLAUDE.md'), after + 'Keep this\n', 'utf8');

    // Deselect all packages
    await mergeAll([], [pkg], projectDir);

    const result = await readFile(join(projectDir, 'CLAUDE.md'), 'utf8');
    expect(result).toContain('Keep this');
    expect(result).not.toContain('# Managed');
    expect(result).not.toContain(USER_SECTION_MARKER);
  });

  it('deletes file when all packages deselected and user section is empty', async () => {
    const pkg = makePkg('a', join(tmpRoot, 'a'));
    await mkdir(pkg.filesPath, { recursive: true });
    await writeFile(join(pkg.filesPath, 'CLAUDE.md'), '# Managed', 'utf8');

    await mergeAll([pkg], [], projectDir);

    // Deselect all packages — no user content
    await mergeAll([], [pkg], projectDir);

    const stat = await lstat(join(projectDir, 'CLAUDE.md')).catch(() => null);
    expect(stat).toBeNull();
  });

  it('does not touch non-mergeable files', async () => {
    const pkg = makePkg('a', join(tmpRoot, 'a'));
    await mkdir(pkg.filesPath, { recursive: true });
    await writeFile(join(pkg.filesPath, 'script.sh'), '#!/bin/bash', 'utf8');

    await mergeAll([pkg], [], projectDir);

    const stat = await lstat(join(projectDir, 'script.sh')).catch(() => null);
    expect(stat).toBeNull();
  });

  it('with dryRun: true does not write any files', async () => {
    const pkg = makePkg('a', join(tmpRoot, 'a'));
    await mkdir(pkg.filesPath, { recursive: true });
    await writeFile(join(pkg.filesPath, 'CLAUDE.md'), '# Hello', 'utf8');

    await mergeAll([pkg], [], projectDir, { dryRun: true });

    const stat = await lstat(join(projectDir, 'CLAUDE.md')).catch(() => null);
    expect(stat).toBeNull();
  });
});
