import { expect, it } from 'vitest';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { canonicalCoverageReport, serializeCoverageReport } from './coverage-reports.ts';
import { parseLineCoverage } from './coverage-lcov.ts';
const root = resolve(tmpdir(), 'hsm-coverage-report'),
  file = 'apps/api/src/main.ts';
const inventory = { executable: new Map([[file, 2]]), excluded: new Map() };
const report = (path: string, hits = 1) =>
  'SF:' + path + '\nDA:1,' + hits + '\nLF:1\nLH:' + (hits > 0 ? 1 : 0) + '\nend_of_record\n';
it('SEC-001: canonicalizes project-relative and absolute paths before cross-job merging', () => {
  const first = canonicalCoverageReport(root, 'apps/api', report('src/main.ts'), inventory);
  const second = canonicalCoverageReport(
    root,
    'apps/api',
    report(resolve(root, file), 0),
    inventory,
  );
  const merged = serializeCoverageReport([...first, ...second]);
  expect(parseLineCoverage(merged)[0]).toEqual({ file, lines: new Map([[1, 1]]) });
});
it.each(['../foreign.ts', '../../outside.ts', 'src/unknown.ts'])(
  'SEC-001: unknown source paths fail (%s)',
  (path) => {
    expect(() => canonicalCoverageReport(root, 'apps/api', report(path), inventory)).toThrow();
  },
);
it('SEC-001: serializes uncovered lines without fabricating hits', () => {
  expect(
    parseLineCoverage(
      serializeCoverageReport([
        {
          file,
          lines: new Map([
            [2, 0],
            [1, 1],
          ]),
        },
      ]),
    )[0]?.lines,
  ).toEqual(
    new Map([
      [1, 1],
      [2, 0],
    ]),
  );
});
it('SEC-001: empty evidence and injected record separators fail', () => {
  expect(() => serializeCoverageReport([])).toThrow();
  expect(() => serializeCoverageReport([{ file: 'evil\nSF:fake', lines: new Map() }])).toThrow();
});
