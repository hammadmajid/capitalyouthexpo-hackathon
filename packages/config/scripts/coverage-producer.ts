import { fileURLToPath } from 'node:url';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { z } from 'zod';
import { insideWorkspace } from '../coverage-discovery.ts';
import { inventoryCoverageSources } from '../coverage-inventory.ts';
import { coverageSnapshot, coverageProjects, readEvidence } from '../coverage-workspace.ts';
import { canonicalCoverageReport, serializeCoverageReport } from '../coverage-reports.ts';
import { createCoverageManifest } from '../coverage-provenance.ts';
const producer = z.enum(['quality', 'infrastructure']).parse(process.argv[2]);
const root = fileURLToPath(new URL('../../..', import.meta.url));
async function run(task: string) {
  const pnpm = z.string().min(1).parse(process.env.npm_execpath);
  await new Promise<void>((done, reject) => {
    const child = spawn(process.execPath, [pnpm, 'turbo', 'run', task, '--concurrency=1'], {
      cwd: root,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? done() : reject(new Error('Coverage producer task failed')),
    );
  });
}
async function main() {
  const before = await coverageSnapshot(root),
    inventory = inventoryCoverageSources(before.sources);
  const projects = await coverageProjects(root, before.sources),
    reports: { project: string; path: string }[] = [];
  for (const { project, scripts } of projects) {
    if (producer === 'quality') {
      if (!scripts['coverage:unit'])
        throw new Error('Product workspace has no unit coverage producer');
      reports.push({ project, path: project + '/coverage/aggregate/lcov.info' });
      if (scripts['coverage:components'])
        reports.push({ project, path: project + '/coverage/aggregate-components/lcov.info' });
    } else if (scripts['test:integration']) {
      if (!scripts['coverage:integration'])
        throw new Error('Infrastructure coverage producer is missing');
      reports.push({ project, path: project + '/coverage/aggregate-infrastructure/lcov.info' });
    }
  }
  if (!reports.length) throw new Error('No coverage producers configured');
  for (const report of reports) {
    try {
      await unlink(insideWorkspace(root, report.path));
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
  }
  if (producer === 'quality') {
    await run('coverage:unit');
    await run('coverage:components');
  } else {
    await run('test:integration');
    await run('coverage:integration');
  }
  const records = [];
  for (const report of reports)
    records.push(
      ...canonicalCoverageReport(
        root,
        report.project,
        await readEvidence(root, report.path),
        inventory,
      ),
    );
  const serialized = serializeCoverageReport(records),
    after = await coverageSnapshot(root);
  const manifest = createCoverageManifest(producer, before.state, after.state, serialized);
  const directory = insideWorkspace(root, 'packages/config/coverage-evidence/' + producer);
  await mkdir(directory, { recursive: true });
  await writeFile(directory + '/lcov.info', serialized, 'utf8');
  await writeFile(directory + '/manifest.json', JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}
await main();
