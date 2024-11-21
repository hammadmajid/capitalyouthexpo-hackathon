import { beforeEach, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import {
  announcements,
  branches,
  conversations,
  customerProfiles,
  managerAssignments,
  ownerProfiles,
  platformAuditLog,
  reports,
  stays,
  supportTickets,
  users,
  visitRequests,
} from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { PlatformInsightsService } from './platform-insights.service.js';
import { platformWindowMetrics } from './platform-window-metrics.js';
import { lockAdmin } from './scope.js';
vi.mock('./scope.js', () => ({ lockAdmin: vi.fn() }));
vi.mock('./platform-window-metrics.js', () => ({ platformWindowMetrics: vi.fn() }));
const id = '10000000-0000-4000-8000-000000000001',
  now = new Date('2026-10-30T06:00:00.000Z');
const actor = { userId: id, sessionId: id };
function fixture() {
  const f = queryFixture();
  return { ...f, service: new PlatformInsightsService(f.database, () => now) };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(lockAdmin).mockResolvedValue({ userId: id, isRoot: true, roles: [] });
  vi.mocked(platformWindowMetrics).mockResolvedValue({
    bookingRequests: 0,
    bookingStates: [],
    respondedRequests: 0,
    averageResponseHours: null,
    slowResponses: 0,
  });
});
it('RPT-003: zero-record Root overview is honest about unavailable telemetry and deferred billing', async () => {
  const f = fixture();
  const result = await f.service.overview(actor, { from: '2026-10-01', to: '2026-10-30' });
  expect(result.snapshot.users).toBe(0);
  expect(result.window.averageResponseHours).toBeNull();
  expect(result.coverage).toEqual({
    searches: 'not_collected',
    listingViews: 'not_collected',
    commercialRetention: 'deferred',
    occupancyFreshness: 'not_collected',
  });
  expect(lockAdmin).toHaveBeenCalledWith(f.transaction, actor, 'root', expect.any(Function));
  expect(platformWindowMetrics).toHaveBeenCalledWith(
    f.transaction,
    new Date('2026-09-30T19:00:00.000Z'),
    new Date('2026-10-30T19:00:00.000Z'),
  );
});
it('RPT-003: aggregates are full-table source counts, not list caps; snapshot and cohort are separate', async () => {
  const f = fixture();
  f.enqueue(branches, [{ count: 1200, published: 1100, pending: 100 }]);
  f.enqueue(users, [{ count: 700000 }], [{ count: 3000 }]);
  f.enqueue(customerProfiles, [{ count: 600000 }]);
  f.enqueue(ownerProfiles, [{ count: 12000 }]);
  f.enqueue(managerAssignments, [{ count: 4000 }]);
  f.enqueue(supportTickets, [{ count: 800 }]);
  f.enqueue(reports, [{ count: 900 }]);
  f.enqueue(announcements, [
    { state: 'scheduled', count: 201 },
    { state: 'sent', count: 40000 },
  ]);
  f.enqueue(conversations, [{ count: 5000 }]);
  f.enqueue(visitRequests, [{ count: 6000 }]);
  f.enqueue(stays, [{ count: 7000 }]);
  vi.mocked(platformWindowMetrics).mockResolvedValue({
    bookingRequests: 200000,
    bookingStates: [{ state: 'confirmed', count: 200000 }],
    respondedRequests: 30000,
    averageResponseHours: 12.5,
    slowResponses: 100,
  });
  const result = await f.service.overview(actor, { from: '2026-10-01', to: '2026-10-30' });
  expect(result.snapshot).toMatchObject({
    users: 700000,
    customers: 600000,
    owners: 12000,
    activeBranches: 1200,
    publishedListings: 1100,
    activeManagers: 4000,
    verificationPending: 100,
    supportPending: 800,
    moderationPending: 900,
    announcements: { scheduled: 201, sent: 40000, cancelled: 0 },
  });
  expect(result.window).toMatchObject({
    registeredUsers: 3000,
    bookingRequests: 200000,
    conversations: 5000,
    visitRequests: 6000,
    checkedIn: 7000,
  });
  expect(f.operations.filter((o) => o.kind === 'limit')).toHaveLength(0);
  const filter = required(f.predicates.find((p) => p.table === branches)).value;
  const sql = new PgDialect().sqlToQuery(filter).sql;
  expect(sql).toContain('"branches"."archived_at" is null');
  expect(sql).toContain('"organizations"."archived_at" is null');
});
it('AUD-001 SEC-003: audit cursor pages timestamp ties and strips arbitrary private internals', async () => {
  const f = fixture();
  const event = (n: bigint) => ({
    id: n,
    actorId: id,
    actorRole: 'root',
    action: 'review.hide',
    targetType: 'review',
    targetId: id,
    createdAt: now,
    before: { passwordHash: 'must-not-leak' },
    after: { phone: 'private' },
    ip: '192.0.2.1',
    userAgent: 'private',
  });
  f.enqueue(platformAuditLog, [event(9n), event(8n), event(7n)]);
  const result = await f.service.audit(actor, {
    cursor: now.toISOString() + '|10',
    limit: 2,
    actorId: id,
    action: 'review.hide',
    from: '2026-10-01',
    to: '2026-10-30',
  });
  expect(result.nextCursor).toBe(now.toISOString() + '|8');
  expect(result.data.map((e) => e.id)).toEqual(['9', '8']);
  expect(result.data[0]).not.toHaveProperty('before');
  expect(result.data[0]).not.toHaveProperty('after');
  expect(result.data[0]).not.toHaveProperty('ip');
  const where = new PgDialect().sqlToQuery(required(f.predicates[0]).value);
  expect(where.params).toContain(10n);
  expect(where.params).toContain('review.hide');
  expect(f.operations.find((o) => o.kind === 'orderBy')?.args).toHaveLength(2);
});
it('SEC-001 AUD-001: Normal roles/revoked actors cannot read platform totals or audit metadata', async () => {
  const f = fixture();
  vi.mocked(lockAdmin).mockRejectedValue(new DomainError('FORBIDDEN', 403, 'Root required'));
  await expect(
    f.service.overview(actor, { from: '2026-10-01', to: '2026-10-30' }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(f.service.audit(actor, {})).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(f.operations).toHaveLength(0);
});
it('SEC-001 RPT-003: invalid range and oversized audit bounds never start protected reads', () => {
  const f = fixture();
  expect(() => f.service.overview(actor, { from: '2026-10-30', to: '2026-10-01' })).toThrow();
  expect(() => f.service.audit(actor, { cursor: 'invalid' })).toThrow();
  expect(() => f.service.audit(actor, { limit: 101 })).toThrow();
  expect(lockAdmin).not.toHaveBeenCalled();
});

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing test fixture value');
  return value;
}
