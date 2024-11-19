import { expect, it } from 'vitest';
import { CoverageFormatError, mergeLineCoverage, parseLineCoverage } from './coverage-lcov.ts';
const report = (body: string, file = 'src/example.ts') => `TN:
SF:${file}
${body}
end_of_record
`;
it('SEC-001 Phase 1: accepts emitted source records with line hits and independent function/branch metadata', () => {
  const records = parseLineCoverage(
    report(
      'FN:1,example\nFNDA:1,example\nFNF:1\nFNH:1\nDA:1,0\nDA:4,2,checksum\nLF:2\nLH:1\nBRDA:4,0,0,2\nBRF:1\nBRH:1\nVER:version',
    ).replaceAll('\n', '\r\n'),
  );
  expect(records[0]?.file).toBe('src/example.ts');
  expect([...(records[0]?.lines ?? [])]).toEqual([
    [1, 0],
    [4, 2],
  ]);
});
it.each([
  '',
  'DA:1,0',
  'end_of_record',
  'SF:\nLF:0\nLH:0\nend_of_record',
  'SF:src/a.ts\nSF:src/b.ts',
  'SF:src/a.ts\nDA:1,0',
  report('DA:1,0\nLF:1'),
  report('DA:1,0\nLF:2\nLH:0'),
  report('DA:1,1\nLF:1\nLH:0'),
  report('DA:1,0\nDA:1,1\nLF:1\nLH:1'),
  report('DA:0,1\nLF:1\nLH:1'),
  report('DA:1,-1\nLF:1\nLH:0'),
  report('DA:1.5,1\nLF:1\nLH:1'),
  report('DA:1,9007199254740992\nLF:1\nLH:1'),
  report('DA:1,1,\nLF:1\nLH:1'),
  report('DA:1,1,x,y\nLF:1\nLH:1'),
  report('DA:1\nLF:1\nLH:1'),
  report('LF:0\nLF:0\nLH:0'),
  report('LF:0\nLH:0\nLH:0'),
  report('LF:0\nLH:0\nUNKNOWN:1'),
])(
  'SEC-001 Phase 1: malformed/incomplete coverage cannot become passing evidence (%#)',
  (value) => {
    expect(() => parseLineCoverage(value)).toThrow(CoverageFormatError);
  },
);
it('SEC-001 Phase 1: repeated suites merge line hits by maximum without inflating the denominator', () => {
  const input = [
    ...parseLineCoverage(report('DA:1,0\nDA:2,1\nLF:2\nLH:1')),
    ...parseLineCoverage(report('DA:1,3\nDA:2,0\nLF:2\nLH:1')),
    ...parseLineCoverage(report('DA:8,0\nLF:1\nLH:0', 'src/other.ts')),
  ];
  const merged = mergeLineCoverage(input);
  expect(merged.found).toBe(3);
  expect(merged.hit).toBe(2);
  expect(merged.percent).toBeCloseTo(200 / 3);
  expect(merged.files.get('src/example.ts')?.get(1)).toBe(3);
  expect(merged.files.get('src/example.ts')?.get(2)).toBe(1);
  expect(input[0]?.lines.get(1)).toBe(0);
});
it('SEC-001 Phase 1: empty executable coverage has no invented passing percentage', () => {
  expect(mergeLineCoverage(parseLineCoverage(report('LF:0\nLH:0')))).toMatchObject({
    found: 0,
    hit: 0,
    percent: null,
  });
  expect(mergeLineCoverage([])).toMatchObject({ found: 0, hit: 0, percent: null });
});
