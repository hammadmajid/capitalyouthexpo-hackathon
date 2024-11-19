import { fileURLToPath } from 'node:url';
import { writeFile, mkdir } from 'node:fs/promises';
import { coverageSnapshot, readEvidence } from '../coverage-workspace.ts';
import { inventoryCoverageSources } from '../coverage-inventory.ts';
import { parseLineCoverage } from '../coverage-lcov.ts';
import {
  verifyCoverageManifest,
  requireCoverageProducers,
  type CoverageManifest,
} from '../coverage-provenance.ts';
import { requireAggregateCoverage } from '../coverage-gate.ts';
import { requirePhaseTwoCoverage } from '../coverage-phase-two.ts';
const root = fileURLToPath(new URL('../../..', import.meta.url));
const snapshot = await coverageSnapshot(root),
  inventory = inventoryCoverageSources(snapshot.sources);
const manifests: CoverageManifest[] = [],
  records = [];
for (const producer of ['quality', 'infrastructure'] as const) {
  const prefix = 'packages/config/coverage-evidence/' + producer;
  const report = await readEvidence(root, prefix + '/lcov.info');
  manifests.push(
    verifyCoverageManifest(
      JSON.parse(await readEvidence(root, prefix + '/manifest.json')),
      snapshot.state,
      producer,
      report,
    ),
  );
  records.push(...parseLineCoverage(report));
}
requireCoverageProducers(manifests);
const result = requireAggregateCoverage(records, inventory);
const business = requirePhaseTwoCoverage(records, inventory);
const output = {
  ...snapshot.state,
  files: result.files.size,
  found: result.found,
  hit: result.hit,
  percent: result.percent,
  excluded: Object.fromEntries(inventory.excluded),
  phaseTwoBusinessCoverage: business,
};
await mkdir('coverage-evidence', { recursive: true });
await writeFile('coverage-evidence/aggregate.json', JSON.stringify(output, null, 2) + '\n', 'utf8');
process.stdout.write(
  JSON.stringify({
    aggregateCoverage: result.percent,
    files: result.files.size,
    phaseTwoBusinessCoverage: business,
  }) + '\n',
);
