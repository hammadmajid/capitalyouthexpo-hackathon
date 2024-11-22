import { expect, it, vi } from 'vitest';
import { reports, reviewRatings, reviewReplies, reviews } from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { ReviewService } from './reviews.service.js';
import { ResidentServicesController } from './services.controller.js';
import { ResidentFeedbackController } from './feedback.controller.js';
import { residentFeedback, residentServices } from './factory.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('../idempotency/context.js', () => ({ requireTransaction: () => current }));
vi.mock('./scope.js', async (original) => ({
  ...(await original<typeof import('./scope.js')>()),
  lockOwnStay: vi.fn(async () => ({ stay: ownStay.value, place: null })),
  lockStaffScope: vi.fn(async () => ({
    organizationId: 'o',
    branchId: 'b',
    actorUserId: 'u',
    actorRole: 'owner',
  })),
  replayAuthorizer: () => async () => true,
}));
vi.mock('../access.js', async (original) => ({
  ...(await original<typeof import('../access.js')>()),
  actorOf: () => ({ userId: '10000000-0000-4000-8000-000000000009' }),
}));
vi.mock('./public-branch.js', () => ({ requirePublicBranch: vi.fn() }));
let current: unknown;
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ownStay = {
  value: {
    id: id(4),
    branchId: id(3),
    userId: id(9),
    state: 'active',
    checkedInAt: new Date('2026-06-25T10:00:00Z'),
    closedAt: null as Date | null,
  },
};
const actor = { userId: id(9) } as never;
let now = new Date('2026-07-10T10:00:00Z');
const clock = () => now;
const idempotency = {
  execute: vi.fn(async (_c, _s, _i, schema, authorize, work) => {
    await authorize(current);
    return { status: 201, replayed: false, body: schema.parse(await work()) };
  }),
} as never;
const ratings = {
  cleanliness: 4,
  security: 5,
  food: 3,
  staff: 4,
  wifi: 2,
  facilities: 4,
  location: 5,
  value: 4,
  overall: 4,
};
const ratingRows = Object.entries(ratings).map(([category, rating]) => ({
  reviewId: id(6),
  category,
  rating,
}));
const reviewRow = {
  id: id(6),
  branchId: id(3),
  stayId: id(4),
  userId: id(9),
  body: 'Good',
  status: 'published',
  moderationReason: null,
  version: 1,
  createdAt: now,
  editedAt: null,
};
const joined = (change: Record<string, unknown> = {}, reply: unknown = null) => ({
  review: { ...reviewRow, ...change },
  fullName: 'Ali Raza Khan',
  reply,
});
it('REV-001..003: eligibility, creation, edit history and uniqueness are server-side', async () => {
  const store = queryFixture();
  current = store.transaction;
  const service = new ReviewService(store.database, idempotency, clock);
  store.enqueue(reviews, []);
  expect(await service.checkEligibility(actor, id(4))).toMatchObject({
    eligible: false,
    reason: 'too_early',
    eligibleFrom: '2026-07-25',
  });
  store.enqueue(reviews, []);
  await expect(service.create(actor, id(7), id(4), { ratings })).rejects.toMatchObject({
    status: 403,
  });
  now = new Date('2026-07-26T10:00:00Z');
  store.enqueue(reviews, [], [reviewRow], [joined()]);
  store.enqueue(reviewRatings, [], [], ratingRows);
  const created = await service.create(actor, id(7), id(4), { ratings, body: 'Good' });
  expect(created.body).toMatchObject({ reviewerName: 'Ali', status: 'published', stayId: id(4) });
  store.enqueue(reviews, [joined()]);
  store.enqueue(reviewRatings, ratingRows);
  expect(await service.checkEligibility(actor, id(4))).toMatchObject({
    reason: 'already_reviewed',
  });
  store.enqueue(reviews, [], []);
  await expect(service.create(actor, id(7), id(4), { ratings })).rejects.toMatchObject({
    status: 409,
  });
  ownStay.value = { ...ownStay.value, checkedInAt: null as never };
  store.enqueue(reviews, []);
  expect((await service.checkEligibility(actor, id(4))).reason).toBe('not_checked_in');
  ownStay.value = {
    ...ownStay.value,
    checkedInAt: new Date('2026-06-25T10:00:00Z'),
    closedAt: new Date('2026-07-30T10:00:00Z'),
  };
  // edit keeps a revision; stale or removed reviews are refused
  store.enqueue(reviews, [joined()], [reviewRow], [], [joined({ version: 2 })]);
  store.enqueue(reviewRatings, ratingRows, ratingRows, [], [], ratingRows);
  expect(
    (await service.edit(actor, id(7), id(4), { ratings, body: 'Better', expectedVersion: 1 })).body
      .version,
  ).toBe(2);
  store.enqueue(reviews, [joined()], [{ ...reviewRow, version: 3 }]);
  store.enqueue(reviewRatings, ratingRows);
  await expect(
    service.edit(actor, id(7), id(4), { ratings, expectedVersion: 1 }),
  ).rejects.toMatchObject({ status: 409 });
  store.enqueue(reviews, [joined()], [{ ...reviewRow, status: 'removed' }]);
  store.enqueue(reviewRatings, ratingRows);
  await expect(
    service.edit(actor, id(7), id(4), { ratings, expectedVersion: 1 }),
  ).rejects.toMatchObject({ status: 409 });
  store.enqueue(reviews, [joined()], [{ ...reviewRow, userId: id(1) }]);
  store.enqueue(reviewRatings, ratingRows);
  await expect(
    service.edit(actor, id(7), id(4), { ratings, expectedVersion: 1 }),
  ).rejects.toMatchObject({ status: 404 });
  store.enqueue(reviews, [], []);
  await expect(
    service.edit(actor, id(7), id(4), { ratings, expectedVersion: 1 }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(service.own(actor, id(4))).rejects.toMatchObject({ status: 404 });
  store.enqueue(reviews, [joined()]);
  store.enqueue(reviewRatings, ratingRows);
  expect((await service.own(actor, id(4))).id).toBe(id(6));
});
it('REV-004..006: public/staff pages, summary, reply and report', async () => {
  const store = queryFixture();
  current = store.transaction;
  const service = new ReviewService(store.database, idempotency, clock);
  const reply = { id: id(8), reviewId: id(6), body: 'Thanks', createdAt: now, editedAt: null };
  store.enqueue(reviews, [joined({}, reply), joined({ id: id(5) })]);
  store.enqueue(
    reviewRatings,
    [...ratingRows, ...ratingRows.map((row) => ({ ...row, reviewId: id(5) }))],
    [{ category: 'overall', average: 4, count: 2 }],
  );
  const page = await service.publicPage(id(3), { limit: '1' });
  expect(page).toMatchObject({
    summary: { count: 2 },
    nextCursor: id(6),
    data: [{ verifiedStay: true, reply: { body: 'Thanks' } }],
  });
  store.enqueue(reviews, []);
  store.enqueue(reviewRatings, []);
  expect((await service.publicPage(id(3), {})).summary).toEqual({ count: 0, averages: null });
  store.enqueue(reviews, [joined({ status: 'hidden', moderationReason: 'Spam' })]);
  store.enqueue(reviewRatings, ratingRows);
  expect((await service.staffPage(actor, id(3), {})).data[0]).toMatchObject({ status: 'hidden' });
  // reply: create then edit; non-published or foreign reviews refused
  store.enqueue(reviews, [reviewRow], [joined({}, reply)], [reviewRow], [joined({}, reply)]);
  store.enqueue(reviewReplies, [], [], [reply], []);
  store.enqueue(reviewRatings, ratingRows, ratingRows);
  expect(
    (await service.reply(actor, id(7), id(3), id(6), { body: 'Thanks' })).body.reply,
  ).toMatchObject({ body: 'Thanks' });
  expect((await service.reply(actor, id(7), id(3), id(6), { body: 'Thanks again' })).body.id).toBe(
    id(6),
  );
  store.enqueue(
    reviews,
    [{ ...reviewRow, status: 'hidden' }],
    [{ ...reviewRow, branchId: id(1) }],
    [],
  );
  await expect(service.reply(actor, id(7), id(3), id(6), { body: 'x' })).rejects.toMatchObject({
    status: 409,
  });
  await expect(service.reply(actor, id(7), id(3), id(6), { body: 'x' })).rejects.toMatchObject({
    status: 404,
  });
  await expect(service.reply(actor, id(7), id(3), id(6), { body: 'x' })).rejects.toMatchObject({
    status: 404,
  });
  store.enqueue(reviews, [{ id: id(6) }], [{ id: id(6) }], []);
  store.enqueue(reports, [], [{ id: id(2) }], [{ id: id(2) }]);
  expect((await service.report(actor, id(7), id(6), { reason: 'spam' })).body).toEqual({
    reportId: id(2),
    status: 'open',
  });
  await expect(service.report(actor, id(7), id(6), { reason: 'spam' })).rejects.toMatchObject({
    status: 409,
  });
  await expect(service.report(actor, id(7), id(6), { reason: 'spam' })).rejects.toMatchObject({
    status: 404,
  });
});
it('Phase 9 controllers delegate every route and unwrap idempotent results', async () => {
  const envelope = { status: 201, replayed: false, body: 'b' };
  const mocked = () => new Proxy({}, { get: () => vi.fn().mockResolvedValue(envelope) }) as never;
  const reply = { code: vi.fn().mockReturnThis(), header: vi.fn().mockReturnThis() } as never;
  const request = { headers: { 'idempotency-key': id(7) }, actor: { userId: id(9) } } as never;
  const services = new ResidentServicesController({
    menu: mocked(),
    routes: mocked(),
    subscriptions: mocked(),
  });
  const feedback = new ResidentFeedbackController({ complaints: mocked(), reviews: mocked() });
  const calls: Promise<unknown>[] = [];
  for (const target of [services, feedback] as unknown as Record<string, unknown>[]) {
    const proto = Object.getPrototypeOf(target) as Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor') continue;
      const method = proto[name] as (...args: unknown[]) => Promise<unknown>;
      const takesReply = method.toString().includes('replay');
      const args = takesReply
        ? [request, reply, id(1), id(2), id(3), {}]
        : [request, id(1), id(2), id(3), {}];
      calls.push(Promise.resolve(method.apply(target, args)));
    }
  }
  const results = await Promise.all(calls);
  expect(results.length).toBeGreaterThan(30);
  const db = queryFixture().database;
  expect(Object.keys(residentServices(db, {} as never))).toEqual([
    'menu',
    'routes',
    'subscriptions',
  ]);
  expect(Object.keys(residentFeedback(db, {} as never, { presignDownload: vi.fn() }, 'b'))).toEqual(
    ['complaints', 'reviews'],
  );
});
