import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { getRepoPath, setRepoPath } from '../src/config.js';

let dir: string;
let configPath: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cl-cfg-'));
  configPath = join(dir, 'config.json');
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

describe('setRepoPath', () => {
  it('writes the resolved absolute path to the config file', async () => {
    const repoDir = join(dir, 'my-repo');
    await mkdir(repoDir);

    await setRepoPath(repoDir, configPath);

    const raw = JSON.parse(await readFile(configPath, 'utf8'));
    expect(raw.schemaVersion).toBe(1);
    expect(raw.repoPath).toBe(repoDir);
  });

  it('resolves relative paths to absolute', async () => {
    const repoDir = join(dir, 'my-repo');
    await mkdir(repoDir);

    await setRepoPath(repoDir, configPath);

    const raw = JSON.parse(await readFile(configPath, 'utf8'));
    expect(raw.repoPath).toMatch(/^\//);
  });
});

describe('getRepoPath', () => {
  it('returns the repoPath when config and directory exist', async () => {
    const repoDir = join(dir, 'repo');
    await mkdir(repoDir);
    await setRepoPath(repoDir, configPath);

    const result = await getRepoPath(configPath);
    expect(result).toBe(repoDir);
  });

  it('calls process.exit(1) when config file is missing', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);

    await expect(getRepoPath(configPath)).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('calls process.exit(1) when repoPath key is absent', async () => {
    const { writeFile } = await import('fs/promises');
    await writeFile(configPath, JSON.stringify({ schemaVersion: 1 }), 'utf8');

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);

    await expect(getRepoPath(configPath)).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('calls process.exit(1) when the repoPath directory does not exist', async () => {
    await setRepoPath(join(dir, 'nonexistent-repo'), configPath);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);

    await expect(getRepoPath(configPath)).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('calls process.exit(1) when repoPath points to a file, not a directory', async () => {
    const filePath = join(dir, 'not-a-dir');
    const { writeFile } = await import('fs/promises');
    await writeFile(filePath, '', 'utf8');
    await setRepoPath(filePath, configPath);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);

    await expect(getRepoPath(configPath)).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
