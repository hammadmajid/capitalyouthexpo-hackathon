import { expect, it } from 'vitest';
import { sessionFamily } from './session-family.js';
it('SEC: reuse resolves the complete replacement family without revoking unrelated devices', () => {
  const rows = [
    { id: 'last', replacedBySessionId: null },
    { id: 'middle', replacedBySessionId: 'last' },
    { id: 'first', replacedBySessionId: 'middle' },
    { id: 'unrelated', replacedBySessionId: null },
  ];
  for (const credential of ['first', 'middle', 'last'])
    expect(sessionFamily(rows, credential)).toEqual(new Set(['first', 'middle', 'last']));
  expect(sessionFamily(rows, 'unrelated')).toEqual(new Set(['unrelated']));
  expect(sessionFamily([], 'missing')).toEqual(new Set(['missing']));
});
it('SEC: corrupted cyclic lineage terminates safely', () => {
  expect(
    sessionFamily(
      [
        { id: 'a', replacedBySessionId: 'b' },
        { id: 'b', replacedBySessionId: 'a' },
      ],
      'a',
    ),
  ).toEqual(new Set(['a', 'b']));
});
