import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeState } from '../../src/services/package-state.js';
import type { Package } from '../../src/types.js';

vi.mock('../../src/config.js', () => ({
  getRepoPath: vi.fn(),
}));

import { getRepoPath } from '../../src/config.js';
import { ignoreCommand } from '../../src/commands/ignore.js';

const mockGetRepoPath = vi.mocked(getRepoPath);

const SECTION_START = '# cla-linker managed — do not edit this block';
const SECTION_END = '# end cla-linker managed';

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

async function setupPkg(name: string, files: string[] = ['a.ts']): Promise<Package> {
  const pkg = makePkg(name);
  await mkdir(pkg.filesPath, { recursive: true });
  for (const f of files) {
    const abs = join(pkg.filesPath, f);
    await mkdir(join(abs, '..'), { recursive: true });
    await writeFile(abs, `// ${f}`, 'utf8');
  }
  return pkg;
}

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'cl-ignore-'));
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

describe('ignoreCommand', () => {
  it('prints a warning and does nothing when no packages are installed', async () => {
    const pkg = await setupPkg('alpha');
    await writeState(pkg.dataJsonPath, { schemaVersion: 1, installedIn: {} });

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await ignoreCommand();

    expect(log.mock.calls.flat().join(' ')).toMatch(/no packages installed/i);

    // .gitignore should not have been created
    const stat = await readFile(join(projectDir, '.gitignore'), 'utf8').catch(() => null);
    expect(stat).toBeNull();
  });

  it('creates .gitignore when it does not exist and adds package files', async () => {
    const pkg = await setupPkg('alpha', ['a.ts', 'b.ts']);
    await writeState(pkg.dataJsonPath, {
      schemaVersion: 1,
      installedIn: { [projectDir]: [join(projectDir, 'a.ts'), join(projectDir, 'b.ts')] },
    });

    vi.spyOn(console, 'log').mockImplementation(() => {});
    await ignoreCommand();

    const content = await readFile(join(projectDir, '.gitignore'), 'utf8');
    expect(content).toContain(SECTION_START);
    expect(content).toContain(SECTION_END);
    expect(content).toContain('a.ts');
    expect(content).toContain('b.ts');
  });

  it('is idempotent — running twice does not duplicate entries', async () => {
    const pkg = await setupPkg('alpha', ['a.ts']);
    await writeState(pkg.dataJsonPath, {
      schemaVersion: 1,
      installedIn: { [projectDir]: [join(projectDir, 'a.ts')] },
    });

    vi.spyOn(console, 'log').mockImplementation(() => {});
    await ignoreCommand();
    await ignoreCommand();

    const content = await readFile(join(projectDir, '.gitignore'), 'utf8');
    const occurrences = content.split('a.ts').length - 1;
    expect(occurrences).toBe(1);
  });

  it('skips entries already present in the managed block', async () => {
    const pkg = await setupPkg('alpha', ['a.ts']);
    await writeState(pkg.dataJsonPath, {
      schemaVersion: 1,
      installedIn: { [projectDir]: [join(projectDir, 'a.ts')] },
    });

    // Pre-populate .gitignore with the managed block already containing a.ts
    const pre = `${SECTION_START}\na.ts\n${SECTION_END}\n`;
    await writeFile(join(projectDir, '.gitignore'), pre, 'utf8');

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await ignoreCommand();

    const output = log.mock.calls.flat().join(' ');
    expect(output).toMatch(/already present/i);

    const content = await readFile(join(projectDir, '.gitignore'), 'utf8');
    const occurrences = content.split('a.ts').length - 1;
    expect(occurrences).toBe(1);
  });

  it('preserves existing content outside the managed block', async () => {
    const pkg = await setupPkg('alpha', ['a.ts']);
    await writeState(pkg.dataJsonPath, {
      schemaVersion: 1,
      installedIn: { [projectDir]: [join(projectDir, 'a.ts')] },
    });

    const pre = 'node_modules\ndist\n';
    await writeFile(join(projectDir, '.gitignore'), pre, 'utf8');

    vi.spyOn(console, 'log').mockImplementation(() => {});
    await ignoreCommand();

    const content = await readFile(join(projectDir, '.gitignore'), 'utf8');
    expect(content).toContain('node_modules');
    expect(content).toContain('dist');
    expect(content).toContain('a.ts');
  });

  it('handles packages with subdirectory files', async () => {
    const pkg = await setupPkg('alpha', ['scripts/setup.sh', 'config/base.json']);
    await writeState(pkg.dataJsonPath, {
      schemaVersion: 1,
      installedIn: {
        [projectDir]: [
          join(projectDir, 'scripts/setup.sh'),
          join(projectDir, 'config/base.json'),
        ],
      },
    });

    vi.spyOn(console, 'log').mockImplementation(() => {});
    await ignoreCommand();

    const content = await readFile(join(projectDir, '.gitignore'), 'utf8');
    expect(content).toContain('scripts/setup.sh');
    expect(content).toContain('config/base.json');
  });

  it('handles multiple installed packages', async () => {
    const pkgA = await setupPkg('alpha', ['alpha.ts']);
    const pkgB = await setupPkg('beta', ['beta.ts']);

    await writeState(pkgA.dataJsonPath, {
      schemaVersion: 1,
      installedIn: { [projectDir]: [join(projectDir, 'alpha.ts')] },
    });
    await writeState(pkgB.dataJsonPath, {
      schemaVersion: 1,
      installedIn: { [projectDir]: [join(projectDir, 'beta.ts')] },
    });

    vi.spyOn(console, 'log').mockImplementation(() => {});
    await ignoreCommand();

    const content = await readFile(join(projectDir, '.gitignore'), 'utf8');
    expect(content).toContain('alpha.ts');
    expect(content).toContain('beta.ts');
  });
});
