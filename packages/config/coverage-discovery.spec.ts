import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';
import { discoverCoverageSources, insideWorkspace } from './coverage-discovery.ts';
import { inventoryCoverageSources } from './coverage-inventory.ts';
async function removeFixture(root: string) {
  if (!root.startsWith(join(tmpdir(), 'hsm-coverage-'))) throw new Error('Invalid test directory');
  await rm(root, { recursive: true, force: true });
}
it('SEC-001: discovers entrypoints, nested adapters and untested source across all product workspaces', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hsm-coverage-'));
  try {
    await mkdir(join(root, 'apps/api/src/nested'), { recursive: true });
    await mkdir(join(root, 'packages/contracts/src'), { recursive: true });
    await mkdir(join(root, 'packages/config'), { recursive: true });
    await writeFile(join(root, 'apps/api/src/main.ts'), 'start();');
    await writeFile(join(root, 'apps/api/src/nested/unused.ts'), 'export const untested = 1;');
    await writeFile(
      join(root, 'packages/contracts/src/types.ts'),
      'export interface Input { name: string }',
    );
    const sources = await discoverCoverageSources(root),
      inventory = inventoryCoverageSources(sources);
    expect([...inventory.executable.keys()]).toEqual([
      'apps/api/src/main.ts',
      'apps/api/src/nested/unused.ts',
    ]);
    expect(inventory.excluded.get('packages/contracts/src/types.ts')).toBe(
      'No emitted executable JavaScript',
    );
  } finally {
    await removeFixture(root);
  }
});
it('SEC-001: an absent product tree cannot pass source discovery', async () => {
  await expect(
    discoverCoverageSources(join(tmpdir(), 'hsm-coverage-missing-tree')),
  ).rejects.toThrow('No executable');
});
it.each(['..', '../escape', '/'])('SEC-001: rejects escaping or root report paths (%s)', (path) => {
  expect(() => insideWorkspace(resolve(tmpdir()), path)).toThrow();
});
it('SEC-001: accepts a bounded workspace report path', () => {
  expect(insideWorkspace(tmpdir(), 'reports/report.info')).toBe(
    resolve(tmpdir(), 'reports/report.info'),
  );
});

it('SEC-001: source discovery rejects a redirected application scope', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hsm-coverage-'));
  try {
    await mkdir(join(root, 'external/api/src'), { recursive: true });
    await writeFile(join(root, 'external/api/src/main.ts'), 'start();');
    await symlink(join(root, 'external'), join(root, 'apps'), 'junction');
    await expect(discoverCoverageSources(root)).rejects.toThrow('symlink');
  } finally {
    await removeFixture(root);
  }
});

it.each(['apps/api', 'apps/api/src', 'apps/api/src/nested'])(
  'SEC-001: rejects project, source and nested redirects (%s)',
  async (path) => {
    const root = await mkdtemp(join(tmpdir(), 'hsm-coverage-'));
    try {
      await mkdir(join(root, 'external'), { recursive: true });
      await writeFile(join(root, 'external/main.ts'), 'start();');
      const target = join(root, path);
      await mkdir(dirname(target), { recursive: true });
      await symlink(join(root, 'external'), target, 'junction');
      await expect(discoverCoverageSources(root)).rejects.toThrow('symlink');
    } finally {
      await removeFixture(root);
    }
  },
);
it('SEC-001: filesystem read errors cannot become an empty successful inventory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hsm-coverage-'));
  try {
    await writeFile(join(root, 'apps'), 'not a directory');
    await expect(discoverCoverageSources(root)).rejects.toThrow();
  } finally {
    await removeFixture(root);
  }
});
