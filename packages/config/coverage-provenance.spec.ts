import { expect, it } from 'vitest';
import {
  CoverageEvidenceError,
  createCoverageManifest,
  fingerprintCoverageSources,
  requireCoverageProducers,
  verifyCoverageManifest,
} from './coverage-provenance.ts';
const snapshot = { revision: 'a'.repeat(40), sourceHash: 'b'.repeat(64) };
const report = 'TN:\nSF:apps/api/src/main.ts\nDA:1,1\nLF:1\nLH:1\nend_of_record\n';
const manifest = () => createCoverageManifest('quality', snapshot, snapshot, report);
it('SEC-001 Phase 1: source fingerprints are order independent and normalize Windows paths', () => {
  const first = { path: 'apps/api/src/main.ts', contents: 'start();' };
  const second = { path: 'apps/web/src/page.tsx', contents: '<main />;' };
  const third = { path: 'apps/worker/src/main.ts', contents: 'run();' };
  expect(fingerprintCoverageSources([first, second, third])).toBe(
    fingerprintCoverageSources([
      third,
      { ...first, path: first.path.replaceAll('/', '\\') },
      second,
    ]),
  );
  expect(fingerprintCoverageSources([first])).not.toBe(
    fingerprintCoverageSources([{ ...first, contents: 'other();' }]),
  );
  expect(fingerprintCoverageSources([first])).not.toBe(
    fingerprintCoverageSources([{ ...first, path: 'apps/api/src/other.ts' }]),
  );
});
it('SEC-001 Phase 1: duplicate fingerprint paths fail rather than silently replacing content', () => {
  expect(() =>
    fingerprintCoverageSources([
      { path: 'apps/api/src/a.ts', contents: 'a();' },
      { path: 'apps\\api\\src\\a.ts', contents: 'b();' },
    ]),
  ).toThrow(CoverageEvidenceError);
});
it('SEC-001 Phase 1: exact revision/source/report evidence verifies for the expected producer', () => {
  expect(verifyCoverageManifest(manifest(), snapshot, 'quality', report)).toEqual(manifest());
});
it.each([
  { ...snapshot, revision: 'c'.repeat(40) },
  { ...snapshot, sourceHash: 'd'.repeat(64) },
  { ...snapshot, revision: 'invalid' },
  { ...snapshot, sourceHash: 'invalid' },
])(
  'SEC-001 Phase 1: changed or invalid producer snapshots cannot attest coverage (%#)',
  (after) => {
    expect(() => createCoverageManifest('quality', snapshot, after, report)).toThrow(
      CoverageEvidenceError,
    );
  },
);
it('SEC-001 Phase 1: producer names are restricted at runtime', () => {
  expect(() => createCoverageManifest('other' as 'quality', snapshot, snapshot, report)).toThrow(
    CoverageEvidenceError,
  );
});
it.each([
  () => ({ ...manifest(), revision: 'c'.repeat(40) }),
  () => ({ ...manifest(), sourceHash: 'd'.repeat(64) }),
  () => ({ ...manifest(), reportHash: 'e'.repeat(64) }),
  () => ({ ...manifest(), producer: 'infrastructure' }),
  () => ({ ...manifest(), version: 2 }),
  () => ({ ...manifest(), extra: 'private value' }),
  () => null,
])('SEC-001 Phase 1: stale, tampered or malformed evidence cannot be consumed (%#)', (value) => {
  expect(() => verifyCoverageManifest(value(), snapshot, 'quality', report)).toThrow(
    CoverageEvidenceError,
  );
});
it('SEC-001 Phase 1: report bytes are bound to the manifest', () => {
  expect(() =>
    verifyCoverageManifest(manifest(), snapshot, 'quality', report + 'tampered'),
  ).toThrow(CoverageEvidenceError);
});
it('SEC-001 Phase 1: both distinct unit and infrastructure producers are required', () => {
  expect(() =>
    requireCoverageProducers([
      manifest(),
      createCoverageManifest('infrastructure', snapshot, snapshot, report),
    ]),
  ).not.toThrow();
  expect(() => requireCoverageProducers([manifest()])).toThrow(CoverageEvidenceError);
  expect(() => requireCoverageProducers([manifest(), manifest()])).toThrow(CoverageEvidenceError);
  expect(() =>
    requireCoverageProducers([
      { ...manifest(), version: 2 } as unknown as ReturnType<typeof manifest>,
    ]),
  ).toThrow(CoverageEvidenceError);
});
