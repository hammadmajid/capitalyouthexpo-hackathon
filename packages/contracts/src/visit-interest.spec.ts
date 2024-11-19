import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { visitInterestInputSchema, visitInterestStateSchema } from './visit-interest.js';
const state = {
  visitId: randomUUID(),
  branchId: randomUUID(),
  expectedUpdatedAt: '2026-10-22T03:00:00Z',
  promptedAt: null,
  stillInterested: null,
  respondedAt: null,
};
it('VISIT-001: explicit false is valid, while absent, coerced or injected decisions are rejected', () => {
  expect(
    visitInterestInputSchema.parse({
      expectedUpdatedAt: state.expectedUpdatedAt,
      stillInterested: false,
    }).stillInterested,
  ).toBe(false);
  for (const stillInterested of [undefined, 'false', 0])
    expect(
      visitInterestInputSchema.safeParse({
        expectedUpdatedAt: state.expectedUpdatedAt,
        stillInterested,
      }).success,
    ).toBe(false);
  expect(
    visitInterestInputSchema.safeParse({
      expectedUpdatedAt: state.expectedUpdatedAt,
      stillInterested: true,
      customerUserId: state.visitId,
    }).success,
  ).toBe(false);
});
it('VISIT-001: interest state requires a matching explicit response and response timestamp', () => {
  expect(visitInterestStateSchema.parse(state)).toEqual(state);
  expect(visitInterestStateSchema.safeParse({ ...state, stillInterested: false }).success).toBe(
    false,
  );
  expect(
    visitInterestStateSchema.safeParse({
      ...state,
      stillInterested: false,
      respondedAt: state.expectedUpdatedAt,
    }).success,
  ).toBe(true);
});
