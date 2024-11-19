import { expect, it } from 'vitest';
import { dashboardQueueKindSchema, dashboardQueuePageSchema } from './dashboard-queues.js';
it('AUD-009 / ACC-002: only implemented exact queue families are accepted', () => {
  expect(dashboardQueueKindSchema.parse('overdue')).toBe('overdue');
  expect(() => dashboardQueueKindSchema.parse('all')).toThrow();
  expect(() =>
    dashboardQueuePageSchema.parse({
      queue: 'complaints',
      branchId: 'foreign',
      data: [],
      nextCursor: null,
    }),
  ).toThrow();
});
