import { beforeEach, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { moderationActions, reports, reviews } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { lockAdmin } from './scope.js';
import { ModerationReadService } from './moderation-read.service.js';
vi.mock('./scope.js', () => ({ lockAdmin: vi.fn() }));
const id = (n: number) => '10000000-0000-4000-8000-' + String(n).padStart(12, '0');
const actor = { userId: id(90), sessionId: id(91) };
const now = new Date('2026-10-30T04:00:00.000Z');
const review = (n: number) => ({
  reviewId: id(n),
  branchId: id(80),
  body: 'Review fixture',
  status: 'hidden',
  moderationReason: 'Policy fixture',
  version: 2,
  createdAt: now,
  editedAt: null,
  userId: id(81),
  stayId: id(82),
  email: 'not-returned@example.test',
});
function fixture() {
  const q = queryFixture();
  return { ...q, service: new ModerationReadService(q.database, () => now) };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(lockAdmin).mockResolvedValue({ userId: actor.userId, isRoot: true, roles: [] });
});
it('REV-006: hidden review restoration discovery is bounded and omits private identity', async () => {
  const f = fixture();
  f.enqueue(reviews, [review(3), review(2), review(1)]);
  const page = await f.service.reviews(actor, { limit: 2, status: 'hidden' });
  expect(page.data.map((r) => r.reviewId)).toEqual([id(3), id(2)]);
  expect(page.nextCursor).toBe(id(2));
  expect(page.data[0]).not.toHaveProperty('userId');
  expect(page.data[0]).not.toHaveProperty('stayId');
  expect(page.data[0]).not.toHaveProperty('email');
  expect(f.operations.find((o) => o.kind === 'limit')?.args).toEqual([3]);
  expect(lockAdmin).toHaveBeenCalledWith(
    f.transaction,
    actor,
    'content_moderator',
    expect.any(Function),
  );
});
it('REV-006: restoration continuation follows a stable UUID boundary and terminates', async () => {
  const f = fixture();
  f.enqueue(reviews, [review(2), review(1)]);
  const page = await f.service.reviews(actor, { limit: 2, cursor: id(3), status: 'removed' });
  expect(page.nextCursor).toBeNull();
  const query = new PgDialect().sqlToQuery(required(f.predicates[0]).value);
  expect(query.sql).toContain('"reviews"."id" <');
  expect(query.params).toEqual(expect.arrayContaining(['removed', id(3)]));
});
it('REV-006: filtered report queue can discover handled cases without exposing reporter identity', async () => {
  const f = fixture();
  const reported = (n: number) => ({
    report: {
      id: id(n),
      status: 'actioned',
      reason: 'spam',
      details: 'Policy issue',
      createdAt: now,
      reporterUserId: id(87),
    },
    review: { ...review(3), id: id(3), status: 'removed' },
  });
  f.enqueue(reports, [reported(8), reported(7)]);
  const page = await f.service.reports(actor, {
    limit: 1,
    reportStatus: 'actioned',
    reviewStatus: 'removed',
    reviewId: id(3),
  });
  expect(page.nextCursor).toBe(id(8));
  expect(page.data[0]).toMatchObject({ reportId: id(8), reviewStatus: 'removed' });
  expect(page.data[0]).not.toHaveProperty('reporterUserId');
  const query = new PgDialect().sqlToQuery(required(f.predicates[0]).value);
  expect(query.params).toEqual(expect.arrayContaining(['review', 'actioned', 'removed', id(3)]));
});
it('REV-006 AUD-003: history pages by timestamp plus UUID and exposes only deliberate reviewer metadata', async () => {
  const f = fixture();
  f.enqueue(reviews, [review(3)]);
  const event = (n: number) => ({
    id: id(n),
    action: 'hide_review',
    reviewerName: 'Moderator',
    reason: 'Policy fixture',
    reportId: null,
    createdAt: now,
    adminUserId: id(90),
    email: 'private@example.test',
  });
  f.enqueue(moderationActions, [event(8), event(7)]);
  const result = await f.service.history(actor, id(3), {
    limit: 1,
    cursor: now.toISOString() + '|' + id(9),
  });
  expect(result.nextCursor).toBe(now.toISOString() + '|' + id(8));
  expect(result.data[0]).toMatchObject({ reviewerName: 'Moderator', action: 'hide_review' });
  expect(result.data[0]).not.toHaveProperty('email');
  expect(result.data[0]).not.toHaveProperty('adminUserId');
  const predicate = required(f.predicates.find((p) => p.table === moderationActions)).value;
  const sql = new PgDialect().sqlToQuery(predicate);
  expect(sql.sql).toContain('"moderation_actions"."created_at" <');
  expect(sql.params).toContain(id(9));
  expect(
    f.operations.find((o) => o.table === moderationActions && o.kind === 'orderBy')?.args,
  ).toHaveLength(2);
});
it('REV-006: review detail is a safe current version and missing detail/history return 404', async () => {
  const f = fixture();
  f.enqueue(reviews, [review(3)]);
  expect(await f.service.detail(actor, id(3))).toMatchObject({
    reviewId: id(3),
    version: 2,
    createdAt: now.toISOString(),
  });
  await expect(f.service.detail(actor, id(3))).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(f.service.history(actor, id(3), {})).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
it('SEC-001 REV-006: invalid page inputs never reach transaction authority or reads', () => {
  const f = fixture();
  expect(() => f.service.reviews(actor, { limit: 51 })).toThrow();
  expect(() => f.service.reports(actor, { cursor: 'invalid' })).toThrow();
  expect(() =>
    f.service.history(actor, id(3), { cursor: now.toISOString() + '|' + id(1) + '|' }),
  ).toThrow();
  expect(() => f.service.detail(actor, 'invalid')).toThrow();
  expect(lockAdmin).not.toHaveBeenCalled();
});
it('SEC-003 REV-006: every report/review/detail/history read denies revoked or wrong-role actors', async () => {
  const f = fixture();
  vi.mocked(lockAdmin).mockRejectedValue(new DomainError('FORBIDDEN', 403, 'Moderator required'));
  for (const work of [
    () => f.service.reports(actor, {}),
    () => f.service.reviews(actor, {}),
    () => f.service.detail(actor, id(3)),
    () => f.service.history(actor, id(3), {}),
  ])
    await expect(work()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(f.predicates).toHaveLength(0);
});

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing test fixture value');
  return value;
}
