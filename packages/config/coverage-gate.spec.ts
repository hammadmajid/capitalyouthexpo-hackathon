import { expect, it } from 'vitest';
import { AggregateCoverageError, requireAggregateCoverage } from './coverage-gate.ts';
import { CoverageFormatError, type SourceLineCoverage } from './coverage-lcov.ts';
const file = 'apps/api/src/main.ts';
const inventory = {
  executable: new Map([[file, 5]]),
  excluded: new Map([['packages/contracts/src/types.ts', 'No emitted executable JavaScript']]),
};
const record = (hits: readonly number[], path = file): SourceLineCoverage => ({
  file: path,
  lines: new Map(hits.map((hit, index) => [index + 1, hit])),
});
it('SEC-001 Phase 1: fixed overall floor accepts exactly 80%, including an uncovered line', () => {
  expect(requireAggregateCoverage([record([1, 1, 1, 1, 0])], inventory)).toMatchObject({
    found: 5,
    hit: 4,
    percent: 80,
  });
});
it('SEC-001 Phase 1: a lower aggregate cannot pass even when scoped business reports pass', () => {
  expect(() => requireAggregateCoverage([record([1, 1, 1, 0, 0])], inventory)).toThrow(
    AggregateCoverageError,
  );
});
it('SEC-001 Phase 1: missing untested runtime files fail instead of narrowing the denominator', () => {
  const broader = {
    ...inventory,
    executable: new Map([...inventory.executable, ['apps/web/src/app/page.tsx', 10]]),
  };
  expect(() => requireAggregateCoverage([record([1, 1, 1, 1, 1])], broader)).toThrow(
    AggregateCoverageError,
  );
});
it('SEC-001 Phase 1: duplicate suites merge unique lines and normalize Windows separators', () => {
  const result = requireAggregateCoverage(
    [record([1, 1, 0, 0, 0]), record([0, 0, 1, 1, 0], file.replaceAll('/', '\\'))],
    inventory,
  );
  expect(result).toMatchObject({ found: 5, hit: 4, percent: 80 });
});
it('SEC-001 Phase 1: zero-bytecode declarations may have empty instrumenter records', () => {
  expect(
    requireAggregateCoverage(
      [record([1, 1, 1, 1, 0]), record([], 'packages/contracts/src/types.ts')],
      inventory,
    ).percent,
  ).toBe(80);
});
it.each([
  'apps/unknown/src/main.ts',
  '/outside/main.ts',
  '../apps/api/src/main.ts',
  'packages/contracts/src/types.ts',
])('SEC-001 Phase 1: unowned or supposedly excluded executable evidence fails (%s)', (path) => {
  expect(() => requireAggregateCoverage([record([1], path)], inventory)).toThrow(
    CoverageFormatError,
  );
});
it.each([
  [0, 1],
  [6, 1],
  [1.5, 1],
  [1, -1],
  [1, 0.5],
  [1, Number.MAX_SAFE_INTEGER + 1],
])(
  'SEC-001 Phase 1: source line bounds and safe integer hits are enforced (%s, %s)',
  (line, hits) => {
    expect(() =>
      requireAggregateCoverage([{ file, lines: new Map([[line, hits]]) }], inventory),
    ).toThrow(CoverageFormatError);
  },
);
it('SEC-001 Phase 1: empty executable reports cannot produce a fabricated 100%', () => {
  expect(() => requireAggregateCoverage([record([])], inventory)).toThrow(AggregateCoverageError);
  expect(() =>
    requireAggregateCoverage([], { executable: new Map(), excluded: new Map() }),
  ).toThrow(AggregateCoverageError);
});

it('SEC-001: an empty runtime file cannot disappear beside a covered file', () => {
  const broader = {
    ...inventory,
    executable: new Map([...inventory.executable, ['apps/web/src/app/page.tsx', 10]]),
  };
  expect(() =>
    requireAggregateCoverage(
      [record([1, 1, 1, 1, 1]), record([], 'apps/web/src/app/page.tsx')],
      broader,
    ),
  ).toThrow(AggregateCoverageError);
});
