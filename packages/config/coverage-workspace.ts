import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { z } from 'zod';
import { discoverCoverageSources, insideWorkspace } from './coverage-discovery.ts';
import { fingerprintCoverageSources } from './coverage-provenance.ts';
const execute = promisify(execFile);
export async function coverageSnapshot(root: string) {
  const { stdout } = await execute('git', ['rev-parse', 'HEAD'], { cwd: root });
  await execute('git', ['diff', '--quiet', 'HEAD'], { cwd: root });
  const untracked = await execute(
    'git',
    ['ls-files', '--others', '--exclude-standard', '--', 'apps', 'packages'],
    { cwd: root },
  );
  if (untracked.stdout.trim())
    throw new Error('Commit product and coverage configuration before producing evidence');
  const sources = await discoverCoverageSources(root);
  return {
    sources,
    state: {
      revision: z
        .string()
        .regex(/^[a-f0-9]{40}$/)
        .parse(stdout.trim()),
      sourceHash: fingerprintCoverageSources(sources),
    },
  };
}
const packageSchema = z.object({ scripts: z.record(z.string(), z.string()) });
export async function coverageProjects(root: string, sources: readonly { path: string }[]) {
  const projects = [
    ...new Set(sources.map((source) => source.path.split('/').slice(0, 2).join('/'))),
  ].filter((path) => path !== 'packages/test-support');
  return Promise.all(
    projects.map(async (project) => ({
      project,
      scripts: packageSchema.parse(
        JSON.parse(await readFile(insideWorkspace(root, project + '/package.json'), 'utf8')),
      ).scripts,
    })),
  );
}
export async function readEvidence(root: string, path: string) {
  const target = insideWorkspace(root, path);
  if (!(await lstat(target)).isFile() || (await realpath(target)) !== target)
    throw new Error('Coverage evidence must be a regular workspace file');
  return readFile(target, 'utf8');
}
