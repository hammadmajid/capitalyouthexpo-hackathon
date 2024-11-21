import { beforeEach, expect, it, vi } from 'vitest';
import {
  adminAccounts,
  adminRoleGrants,
  branches,
  notificationOutbox,
  organizations,
  reports,
  reviews,
  branchVerificationEvents,
} from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { GovernanceService } from './governance.service.js';
import type { Actor } from '../authorization/store.js';
import type { IdempotencyService } from '../idempotency/service.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('../idempotency/context.js', () => ({ requireTransaction: () => store.transaction }));
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const actor = { userId: id(1) } as Actor;
const now = new Date('2026-10-30T10:00:00Z');
let store: ReturnType<typeof queryFixture>;
let service: GovernanceService;
beforeEach(() => {
  store = queryFixture();
  service = new GovernanceService(
    store.database,
    {
      execute: async (...args: Parameters<IdempotencyService['execute']>) => {
        const [, , , schema, auth, work] = args;
        await auth(store.transaction);
        return { status: 200, replayed: false, body: schema.parse(await work()) };
      },
    } as never,
    () => now,
  );
  store.enqueue(
    adminAccounts,
    [{ isRoot: true, status: 'active' }],
    [{ isRoot: true, status: 'active' }],
  );
  store.enqueue(adminRoleGrants, [], []);
});
it('ADM-007 NTF-001: decision notice belongs to persisted event and omits private reviewer notes', async () => {
  store.enqueue(branches, [
    {
      id: id(2),
      name: 'Branch',
      organizationId: id(3),
      verificationStatus: 'submitted',
      updatedAt: now,
    },
  ]);
  store.enqueue(organizations, [{ name: 'Org', ownerId: id(4) }]);
  await service.decideVerification(actor, id(5), id(2), {
    action: 'reject',
    reason: 'Private operational reason',
    expectedStatus: 'submitted',
  });
  const event = store.writes.find((w) => w.table === branchVerificationEvents)?.value as {
    id: string;
  };
  const notice = store.writes.find((w) => w.table === notificationOutbox)?.value;
  expect(notice).toMatchObject({
    recipientUserId: id(4),
    payload: { event: 'owner.verification_updated', operationId: event.id },
  });
  expect(JSON.stringify(notice)).not.toContain('Private operational reason');
});
it('ADM-007: stale dossier is denied before decision/event/notice writes', async () => {
  store.enqueue(branches, [{ id: id(2), verificationStatus: 'submitted', updatedAt: now }]);
  await expect(
    service.decideVerification(actor, id(5), id(2), {
      action: 'approve',
      expectedStatus: 'under_review',
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect(store.writes).toEqual([]);
});
it.each([
  { targetType: 'chat_message', targetId: id(2), status: 'open' },
  { targetType: 'review', targetId: id(9), status: 'open' },
  { targetType: 'review', targetId: id(2), status: 'dismissed' },
])('REV-006: report association %j must match the live review and open case', async (report) => {
  store.enqueue(reviews, [{ id: id(2), status: 'published', version: 1 }]);
  store.enqueue(reports, [{ id: id(6), ...report }]);
  await expect(
    service.moderateReview(actor, id(5), id(2), {
      action: 'hide',
      reason: 'Policy violation',
      expectedVersion: 1,
      reportId: id(6),
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect(store.writes).toEqual([]);
});
