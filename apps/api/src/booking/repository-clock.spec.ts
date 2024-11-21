import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { bookingHolds, bookingPolicies, bookings, users, expireRoomReservations } from '@hsm/db';
import { bookingQuoteSnapshotSchema, bookingSummarySchema } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { AuditWriter } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { currentInventoryQuote, lockPublicInventory } from './quote.js';
import { bookingProjection } from './projection.js';
import { BookingRepository } from './repository.js';
import { bookingEvidence, requireBookingCustomer } from './evidence.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('./quote.js', () => ({ currentInventoryQuote: vi.fn(), lockPublicInventory: vi.fn() }));
vi.mock('./availability.js', () => ({ requireInventoryAvailable: vi.fn() }));
vi.mock('./evidence.js', () => ({
  requireBookingCustomer: vi.fn(),
  requireNoUnverifiedUpfront: vi.fn(),
  bookingEvidence: vi.fn(async () => []),
}));
vi.mock('./projection.js', () => ({
  bookingProjection: vi.fn(),
  bookingPage: vi.fn(),
  publicBranch: vi.fn(),
}));
vi.mock('@hsm/db', async (original) => ({
  ...(await original<typeof import('@hsm/db')>()),
  expireRoomReservations: vi.fn(),
}));
const branchId = randomUUID(),
  roomId = randomUUID(),
  policyId = randomUUID(),
  holdId = randomUUID();
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  bookingId = randomUUID();
const quoteInput = {
  target: { kind: 'room' as const, roomId },
  range: { moveInDate: '2026-10-15', moveOutDate: '2026-11-15' },
};
const quote = bookingQuoteSnapshotSchema.parse({
  version: 1,
  currency: 'PKR',
  ...quoteInput,
  listing: {
    hostelName: 'Fixture hostel',
    branchName: 'Fixture branch',
    roomTypeName: 'Two beds',
    roomLabel: '101',
    bedLabel: null,
  },
  price: { monthlyRentPaisa: 1800001, depositPaisa: 0, fees: [] },
  policyVersion: policyId,
  policyLineage: [policyId],
  quotedAt: '2026-10-14T12:00:00Z',
  policy: {
    bookingMode: 'request',
    holdSeconds: 600,
    requestExpirySeconds: 3600,
    requestReservesInventory: true,
    minimumStayDays: 1,
    maximumStayDays: 'unlimited',
    minimumAdvanceDays: 0,
    maximumAdvanceDays: 365,
    customerSelectsInventory: true,
    cancellationAllowed: true,
    cancellationCutoffHours: 0,
    allowedStayUnits: ['day', 'week', 'month'],
    requiredDocuments: [],
    allowEvidenceReuse: true,
    documentReviewRequired: false,
  },
});
const heldQuote = bookingQuoteSnapshotSchema.parse({
  ...quote,
  policy: { ...quote.policy, bookingMode: 'instant' },
});
const initial = new Date('2026-10-14T12:00:00Z'),
  expired = new Date('2026-10-14T12:12:00Z');
const inventory = {
  branch: { id: branchId, organizationId: randomUUID(), brandId: randomUUID(), category: 'boys' },
  room: { id: roomId },
  seat: undefined,
} as Awaited<ReturnType<typeof lockPublicInventory>>;
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(bookingEvidence).mockResolvedValue([]);
  vi.mocked(requireBookingCustomer).mockResolvedValue('male');
});
function fixture() {
  const store = queryFixture(),
    audit = new AuditWriter();
  store.enqueue(users, [{ permanentAddress: 'House 12, Islamabad' }]);
  vi.spyOn(audit, 'hostel').mockResolvedValue(undefined);
  let time = initial.getTime();
  const clock = () => new Date(time);
  const repository = new BookingRepository(
    store.database,
    'private',
    {
      protectCnic: vi.fn(),
      equals: vi.fn(),
    },
    audit,
    clock,
  );
  vi.mocked(lockPublicInventory).mockResolvedValue(inventory);
  const summary = bookingSummarySchema.parse({
    id: bookingId,
    branchId,
    reference: 'HSM-' + bookingId.replaceAll('-', '').toUpperCase(),
    state: 'confirmed',
    quote: heldQuote,
    createdAt: initial.toISOString(),
    requestExpiresAt: null,
    documents: [],
    upfront: null,
  });
  vi.mocked(bookingProjection).mockResolvedValue(summary);
  store.enqueue(bookingHolds, [
    {
      id: holdId,
      quoteSnapshot: heldQuote,
      releasedAt: null,
      expiresAt: new Date(initial.getTime() + 600000),
    },
  ]);
  store.enqueue(bookings, [{ total: 0 }], [{ id: bookingId }]);
  return {
    ...store,
    repository,
    summary,
    advance: () => {
      time = expired.getTime();
    },
  };
}
it('BKG-003: a live own hold can still be consumed before its deadline', async () => {
  const store = fixture();
  await expect(
    store.repository.create(store.transaction, actor, branchId, {
      quote: heldQuote,
      holdId,
      documents: [],
    }),
  ).resolves.toEqual(store.summary);
  expect(store.writes.some((write) => write.table === bookings && write.kind === 'insert')).toBe(
    true,
  );
});
it('BKG-003 / ACC-001: a hold that expires during inventory lock wait cannot create a booking', async () => {
  const store = fixture();
  vi.mocked(lockPublicInventory).mockImplementationOnce(async () => {
    store.advance();
    return inventory;
  });
  await expect(
    store.repository.create(store.transaction, actor, branchId, {
      quote: heldQuote,
      holdId,
      documents: [],
    }),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(store.writes.some((write) => write.table === bookings && write.kind === 'insert')).toBe(
    false,
  );
});
it('BKG-003: new hold TTL starts after inventory locks, without backdated expiry', async () => {
  const store = fixture();
  vi.mocked(currentInventoryQuote).mockImplementationOnce(async () => {
    store.advance();
    return { inventory, quote: heldQuote };
  });
  store.enqueue(bookingPolicies, [
    {
      limits: {
        maximumHoldSeconds: 3600,
        maximumActiveHolds: 3,
        maximumRequestExpirySeconds: 86400,
        maximumAdvanceDays: 365,
        maximumFiniteStayDays: 730,
      },
    },
  ]);
  const result = await store.repository.hold(store.transaction, actor, branchId, heldQuote);
  expect(result.expiresAt).toBe(
    new Date(expired.getTime() + heldQuote.policy.holdSeconds * 1000).toISOString(),
  );
  expect(expireRoomReservations).toHaveBeenCalledWith(store.transaction, roomId, expired);
  expect(lockActor).toHaveBeenCalledWith(store.transaction, actor, expect.any(Function));
});

it('BKG-003 / ACC-001: hold expiry during evidence validation cannot be consumed afterward', async () => {
  const store = fixture();
  vi.mocked(bookingEvidence).mockImplementationOnce(async () => {
    store.advance();
    return [];
  });
  await expect(
    store.repository.create(store.transaction, actor, branchId, {
      quote: heldQuote,
      holdId,
      documents: [],
    }),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(store.writes.some((write) => write.table === bookings && write.kind === 'insert')).toBe(
    false,
  );
});
