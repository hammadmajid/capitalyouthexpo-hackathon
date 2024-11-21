import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  notificationOutbox,
  branches,
  bookings,
  bookingDocuments,
  files,
  rooms,
  customerProfiles,
  users,
} from '@hsm/db';
import { bookingQuoteSnapshotSchema, bookingSummarySchema } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { AuditWriter } from '../audit/writer.js';
import { bookingProjection } from './projection.js';
import { BookingActionRepository } from './actions.repository.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('./availability.js', () => ({ requireInventoryAvailable: vi.fn() }));
vi.mock('./projection.js', () => ({
  bookingProjection: vi.fn(),
  bookingPage: vi.fn(),
  publicBranch: vi.fn(),
}));
vi.mock('./evidence.js', async (original) => ({
  ...(await original<typeof import('./evidence.js')>()),
  requireNoUnverifiedUpfront: vi.fn(),
}));
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  customerId = randomUUID();
const branchId = randomUUID(),
  roomId = randomUUID(),
  policyId = randomUUID(),
  bookingId = randomUUID(),
  fileId = randomUUID();
const now = new Date('2026-10-14T12:00:00Z');
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
beforeEach(() => vi.resetAllMocks());
function fixture(
  options: {
    category?: string;
    profile?: boolean;
    address?: boolean;
    documents?: boolean;
    scan?: 'clean' | 'rejected';
    documentState?: 'pending' | 'accepted' | 'rejected';
    missingDocument?: boolean;
    fileState?: 'missing' | 'wrong_purpose';
    reviewRequired?: boolean;
    bucket?: string | null;
  } = {},
) {
  const store = queryFixture(),
    audit = new AuditWriter(),
    organizationId = randomUUID();
  store.enqueue(users, [
    { permanentAddress: options.address === false ? null : 'House 12, Islamabad' },
  ]);
  const recordAudit = vi.spyOn(audit, 'hostel').mockResolvedValue(undefined);
  const snapshot = bookingQuoteSnapshotSchema.parse({
    ...quote,
    policy: {
      ...quote.policy,
      requiredDocuments: options.documents ? ['student_id'] : [],
      documentReviewRequired: Boolean(options.documents) && options.reviewRequired !== false,
    },
  });
  const booking: typeof bookings.$inferSelect = {
    id: bookingId,
    branchId,
    roomId,
    seatId: null,
    customerUserId: customerId,
    holdId: null,
    moveInDate: snapshot.range.moveInDate,
    moveOutDate: snapshot.range.moveOutDate,
    quoteSnapshot: snapshot,
    policyVersionId: policyId,
    state: 'pending_request',
    requestExpiresAt: new Date(now.getTime() + 3600000),
    createdAt: now,
    updatedAt: now,
  };
  const repository = new BookingActionRepository(
    store.database,
    audit,
    () => now,
    options.bucket === null ? undefined : 'private',
  );
  vi.spyOn(repository, 'target').mockResolvedValue(booking);
  const summary = bookingSummarySchema.parse({
    id: bookingId,
    branchId,
    reference: 'HSM-' + bookingId.replaceAll('-', '').toUpperCase(),
    state: 'confirmed',
    quote: snapshot,
    createdAt: now.toISOString(),
    requestExpiresAt: booking.requestExpiresAt?.toISOString(),
    documents: options.documents
      ? [{ kind: 'student_id', state: options.documentState ?? 'accepted' }]
      : [],
    upfront: null,
  });
  vi.mocked(bookingProjection).mockResolvedValue(summary);
  const branch = { category: options.category ?? 'girls', organizationId };
  store.enqueue(branches, [branch], [branch]);
  store.enqueue(
    customerProfiles,
    options.profile === false
      ? []
      : [
          {
            completedAt: now,
            verifiedAt: now,
            email: 'customer@example.test',
            passwordHash: 'encoded fixture',
            fullName: 'Test customer',
            phone: '+923001234567',
            gender: 'female',
            status: 'active',
            age: 20,
          },
        ],
  );
  store.enqueue(rooms, [{ status: 'active', archivedAt: null }]);
  store.enqueue(
    bookingDocuments,
    options.missingDocument
      ? []
      : [{ kind: 'student_id', state: options.documentState ?? 'accepted', fileId }],
  );
  store.enqueue(
    files,
    options.fileState === 'missing'
      ? []
      : [
          {
            id: fileId,
            purpose: options.fileState === 'wrong_purpose' ? 'avatar' : 'resident_document',
            scanStatus: options.scan ?? 'clean',
          },
        ],
  );
  return {
    ...store,
    recordAudit,
    summary,
    repository,
    confirm: () =>
      repository.confirm(
        store.transaction,
        actor,
        branchId,
        bookingId,
        'Accept request',
        customerId,
      ),
  };
}
it('BKG-001 / SRS p21: compatible current profile can reach request confirmation', async () => {
  const store = fixture();
  await expect(store.confirm()).resolves.toEqual(store.summary);
  expect(store.recordAudit).toHaveBeenCalledTimes(1);
  expect(store.writes.find((write) => write.table === notificationOutbox)?.value).toMatchObject({
    eventType: 'booking.lifecycle',
    recipientUserId: null,
    payload: { event: 'booking.confirmed', bookingId },
  });
});
it('BKG-001 / SRS p21: changed incompatible Customer gender cannot reach confirmation', async () => {
  const store = fixture({ category: 'boys' });
  await expect(store.confirm()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(store.writes).toHaveLength(0);
  expect(store.recordAudit).not.toHaveBeenCalled();
});
it('BKG-001: incomplete current Customer profile cannot be confirmed', async () => {
  const store = fixture({ profile: false });
  await expect(store.confirm()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(store.writes).toHaveLength(0);
});
it('BKG-001 / SEC-003: accepted evidence backed by a clean owned private file permits confirmation', async () => {
  const store = fixture({ documents: true });
  await expect(store.confirm()).resolves.toEqual(store.summary);
});
it('BKG-001 / SEC-003: accepted review cannot override revoked file scan status', async () => {
  const store = fixture({ documents: true, scan: 'rejected' });
  await expect(store.confirm()).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(store.writes).toHaveLength(0);
  expect(store.recordAudit).not.toHaveBeenCalled();
});

it.each([
  { documentState: 'pending' as const },
  { documentState: 'rejected' as const },
  { missingDocument: true },
  { fileState: 'missing' as const },
  { fileState: 'wrong_purpose' as const },
])(
  'BKG-001 / SEC-003: missing, rejected or unsuitable required evidence fails closed: %j',
  async (options) => {
    const store = fixture({ documents: true, ...options });
    await expect(store.confirm()).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(store.writes).toHaveLength(0);
  },
);
it('BKG-001: policy may allow clean pending evidence without human review', async () => {
  const store = fixture({ documents: true, reviewRequired: false, documentState: 'pending' });
  await expect(store.confirm()).resolves.toHaveProperty('state', 'confirmed');
});
it('SEC-003: missing private bucket configuration cannot authorize evidence confirmation', async () => {
  const store = fixture({ documents: true, bucket: null });
  await expect(store.confirm()).rejects.toMatchObject({ code: 'INTERNAL' });
  expect(store.writes).toHaveLength(0);
});

it('AUTH-C-005 / BKG-002: confirmation revalidates a permanent address without mutating booking state', async () => {
  const store = fixture({ address: false });
  await expect(store.confirm()).rejects.toMatchObject({ code: 'VALIDATION_FAILED', status: 422 });
  expect(store.writes).toHaveLength(0);
  expect(store.recordAudit).not.toHaveBeenCalled();
});

it('ACC-004 SEC-003: a changed Customer binding fails before private profile/evidence reads or writes', async () => {
  const store = fixture();
  await expect(
    store.repository.confirm(
      store.transaction,
      actor,
      branchId,
      bookingId,
      'Accept request',
      randomUUID(),
    ),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(
    store.predicates.filter(
      (entry) => entry.table === users || entry.table === customerProfiles || entry.table === files,
    ),
  ).toHaveLength(0);
  expect(store.writes).toHaveLength(0);
  expect(store.recordAudit).not.toHaveBeenCalled();
});
