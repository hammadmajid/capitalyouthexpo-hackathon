import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';
import { coverageSnapshot, coverageProjects, readEvidence } from './coverage-workspace.ts';
const execute = promisify(execFile);
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hsm-coverage-workspace-'));
  await mkdir(join(root, 'apps/api/src'), { recursive: true });
  await writeFile(join(root, 'apps/api/src/main.ts'), 'export const started = true;');
  await writeFile(
    join(root, 'apps/api/package.json'),
    JSON.stringify({ scripts: { 'coverage:unit': 'vitest' } }),
  );
  const git = (...args: string[]) => execute('git', args, { cwd: root });
  await writeFile(join(root, 'pnpm-workspace.yaml'), 'packages: [apps/*]\n');
  await git('init');
  await git('add', 'apps', 'pnpm-workspace.yaml');
  await git(
    '-c',
    'user.name=Coverage fixture',
    '-c',
    'user.email=coverage@example.test',
    'commit',
    '-m',
    'test: coverage fixture',
  );
  return root;
}
async function cleanup(root: string) {
  if (!root.startsWith(join(tmpdir(), 'hsm-coverage-workspace-')))
    throw new Error('Invalid fixture');
  await rm(root, { recursive: true, force: true });
}
it('SEC-001: producers require committed source and bind a deterministic clean Git revision', async () => {
  const root = await fixture();
  try {
    const first = await coverageSnapshot(root),
      second = await coverageSnapshot(root);
    expect(first.state).toEqual(second.state);
    expect(first.state.revision).toMatch(/^[a-f0-9]{40}$/);
    expect(first.state.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(
      await coverageProjects(root, [
        ...first.sources,
        { path: 'packages/test-support/src/fixture.ts' },
      ]),
    ).toEqual([{ project: 'apps/api', scripts: { 'coverage:unit': 'vitest' } }]);
    await writeFile(join(root, 'apps/api/src/untracked.ts'), 'start();');
    await expect(coverageSnapshot(root)).rejects.toThrow('Commit product');
    await rm(join(root, 'apps/api/src/untracked.ts'));
    await writeFile(join(root, 'apps/api/src/main.ts'), 'changed();');
    await expect(coverageSnapshot(root)).rejects.toThrow();
  } finally {
    await cleanup(root);
  }
}, 60000);
it('SEC-001: evidence reads reject directories, traversal and redirected parent paths', async () => {
  const root = await fixture();
  try {
    await writeFile(join(root, 'report.info'), 'real report');
    expect(await readEvidence(root, 'report.info')).toBe('real report');
    await expect(readEvidence(root, '../outside')).rejects.toThrow('escapes');
    await expect(readEvidence(root, 'apps')).rejects.toThrow('regular workspace file');
    await mkdir(join(root, 'reports'));
    await writeFile(join(root, 'reports/lcov.info'), 'real report');
    await symlink(join(root, 'reports'), join(root, 'redirect'), 'junction');
    await expect(readEvidence(root, 'redirect/lcov.info')).rejects.toThrow(
      'regular workspace file',
    );
  } finally {
    await cleanup(root);
  }
}, 60000);

it('SEC-001: revision evidence rejects modified root workspace configuration', async () => {
  const root = await fixture();
  try {
    await coverageSnapshot(root);
    await writeFile(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
    await expect(coverageSnapshot(root)).rejects.toThrow();
  } finally {
    await cleanup(root);
  }
}, 60000);
