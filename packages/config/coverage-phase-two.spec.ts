import { expect, it } from 'vitest';
import { PhaseTwoCoverageError, requirePhaseTwoCoverage } from './coverage-phase-two.ts';
import { AggregateCoverageError } from './coverage-gate.ts';
import { CoverageFormatError, type SourceLineCoverage } from './coverage-lcov.ts';
const paths = [
  'apps/api/src/booking/service.ts',
  'apps/api/src/inventory/service.ts',
  'apps/api/src/marketplace/service.ts',
  'apps/api/src/inbox/service.ts',
  'packages/db/src/inventory-expiry.ts',
  'packages/db/src/inventory-lock.ts',
  'packages/db/src/booking-lifecycle.ts',
  'packages/notifications/src/service.ts',
];
function fixture() {
  return {
    inventory: {
      executable: new Map(paths.map((file) => [file, 10])),
      excluded: new Map<string, string>(),
    },
    records: paths.map((file) => ({
      file,
      lines: new Map(Array.from({ length: 10 }, (_, index) => [index + 1, index < 9 ? 1 : 0])),
    })),
  };
}
it('SEC-001 / P2-I/J: each required domain accepts exactly 90% without requiring local container execution', () => {
  const value = fixture();
  const result = requirePhaseTwoCoverage(value.records, value.inventory);
  expect(result).toHaveLength(6);
  expect(result.every((scope) => scope.percent === 90)).toBe(true);
  expect(result.find((scope) => scope.scope === 'reservations')).toMatchObject({
    files: 3,
    found: 30,
    hit: 27,
  });
});
it.each(paths.filter((file) => !file.includes('/db/')))(
  'SEC-001: unrelated high coverage cannot hide an under-covered Phase 2 domain: %s',
  (file) => {
    const value = fixture();
    const record = value.records.find((row) => row.file === file);
    if (!record) throw new Error('Fixture missing');
    record.lines.set(9, 0);
    const unrelated: SourceLineCoverage = {
      file: 'apps/web/src/app/page.tsx',
      lines: new Map(Array.from({ length: 1000 }, (_, index) => [index + 1, 1])),
    };
    value.inventory.executable.set(unrelated.file, 1000);
    expect(() => requirePhaseTwoCoverage([...value.records, unrelated], value.inventory)).toThrow(
      PhaseTwoCoverageError,
    );
  },
);
it('ACC-001 / NTF-002: combined expiry/locking/outbox coverage below 90% blocks acceptance', () => {
  const value = fixture();
  const record = value.records.find((row) => row.file.endsWith('inventory-expiry.ts'));
  if (!record) throw new Error('Fixture missing');
  record.lines.set(9, 0);
  expect(() => requirePhaseTwoCoverage(value.records, value.inventory)).toThrow(
    PhaseTwoCoverageError,
  );
});
it('SEC-001: absent business domains cannot disappear from the gate', () => {
  const value = fixture(),
    removed = paths[0];
  if (!removed) throw new Error('Fixture missing');
  value.inventory.executable.delete(removed);
  expect(() =>
    requirePhaseTwoCoverage(
      value.records.filter((row) => row.file !== removed),
      value.inventory,
    ),
  ).toThrow(PhaseTwoCoverageError);
});
it.each(paths.filter((file) => file.includes('/db/')))(
  'ACC-001: deleting a required reservation module cannot narrow the domain: %s',
  (file) => {
    const value = fixture();
    value.inventory.executable.delete(file);
    expect(() =>
      requirePhaseTwoCoverage(
        value.records.filter((row) => row.file !== file),
        value.inventory,
      ),
    ).toThrow(PhaseTwoCoverageError);
  },
);
it('SEC-001: reports combine unique hit lines across quality and infrastructure without duplicate inflation', () => {
  const value = fixture();
  const record = value.records[0];
  if (!record) throw new Error('Fixture missing');
  record.lines.set(9, 0);
  const infrastructure = { file: record.file.replaceAll('/', '\\'), lines: new Map([[9, 1]]) };
  expect(
    requirePhaseTwoCoverage([...value.records, infrastructure], value.inventory).find(
      (scope) => scope.scope === 'booking',
    ),
  ).toMatchObject({ found: 10, hit: 9, percent: 90 });
});
it('SEC-001: a missing executable report still fails the unchanged whole-application gate', () => {
  const value = fixture();
  expect(() => requirePhaseTwoCoverage(value.records.slice(1), value.inventory)).toThrow(
    AggregateCoverageError,
  );
});
it('SEC-001: invalid line evidence cannot bypass the original bounds checks', () => {
  const value = fixture();
  value.records[0]?.lines.set(11, 1);
  expect(() => requirePhaseTwoCoverage(value.records, value.inventory)).toThrow(
    CoverageFormatError,
  );
});
