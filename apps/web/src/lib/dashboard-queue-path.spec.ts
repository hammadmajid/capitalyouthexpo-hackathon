import { expect, it } from 'vitest';
import {
  dashboardQueuePath,
  parseDashboardQueuePath,
  dashboardNavigationQueueSchema,
} from './dashboard-queue-path';
const branch = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
it.each(dashboardNavigationQueueSchema.options)(
  'AUD-009 / SEC-001: canonical %s links preserve space and exact branch',
  (queue) => {
    expect(parseDashboardQueuePath(dashboardQueuePath('manager', queue, branch))).toEqual({
      context: 'manager',
      queue,
      branchId: branch,
    });
    expect(parseDashboardQueuePath(dashboardQueuePath('owner', queue))).toEqual({
      context: 'owner',
      queue,
    });
  },
);
it.each([
  'https://attacker.example/app/owner/queues/proofs',
  '/app/owner/queues/proofs/../',
  '/app/admin/queues/proofs',
  '/app/owner/queues/all',
  '/app/owner/queues/proofs?branchId=x',
  '/app/owner/queues/proofs/not-a-uuid',
])('SEC-001: rejects ambiguous or unsupported queue return %s', (path) => {
  expect(parseDashboardQueuePath(path)).toBeUndefined();
});
