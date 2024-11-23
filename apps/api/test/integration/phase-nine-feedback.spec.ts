import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { verifiedKey } from '@hsm/files';
import {
  complaintEvents,
  files,
  managerAssignments,
  managerInventoryGrants,
  reviews,
} from '@hsm/db';
import {
  complaintDetailSchema,
  ownReviewSchema,
  publicReviewPageSchema,
  reviewEligibilitySchema,
} from '@hsm/contracts';
import { fullPeriod, lifecycleHarness } from './phase-nine-fixture.js';
const h = lifecycleHarness();
beforeAll(() => h.start());
afterAll(() => h.close());
async function attachment(owner: string) {
  const f = h.fixture(),
    id = randomUUID(),
    bytes = Buffer.from('Leaking tap photo ' + id),
    key = verifiedKey('complaint_attachment', id);
  await f.storage.storage.putVerified(key, 'application/pdf', bytes);
  await f.connection.db.insert(files).values({
    id,
    uploadedBy: owner,
    bucket: f.storage.bucket,
    visibility: 'private',
    objectKey: key,
    purpose: 'complaint_attachment',
    scanStatus: 'clean',
    mimeType: 'application/pdf',
    sizeBytes: BigInt(bytes.length),
    sha256: createHash('sha256').update(bytes).digest(),
  });
  return id;
}
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
it('CMP-001..006: complaint lifecycle with reopen history, private attachments and scope', async () => {
  const f = h.fixture();
  const { item, stay, base } = await h.admitted(fullPeriod, '2026-08-25');
  const own = `/v1/me/stays/${stay.stayId}/complaints`;
  const fileId = await attachment(f.customerA);
  const created = complaintDetailSchema.parse(
    await h.ok(
      own,
      {
        category: 'plumbing',
        title: 'Tap leaking',
        description: 'Bathroom tap leaks all night',
        attachmentFileIds: [fileId],
      },
      f.customerAToken,
    ),
  );
  expect(created).toMatchObject({ status: 'open', bedLabel: 'A', attachmentFileIds: [fileId] });
  // Another customer's upload or a reused file is refused.
  expect(
    (
      await h.send(
        own,
        { category: 'other', title: 'x', description: 'y', attachmentFileIds: [fileId] },
        f.customerAToken,
      )
    ).statusCode,
  ).toBe(409);
  const staff = `/v1/branches/${item.branchId}/complaints/${created.id}/actions`;
  const act = async (body: Record<string, unknown>, token?: string) =>
    complaintDetailSchema.parse(await h.ok(staff, body, token));
  const resident = (body: Record<string, unknown>) =>
    h.send(`${own}/${created.id}/actions`, body, f.customerAToken);
  expect((await resident({ action: 'accept', expectedVersion: 1 })).statusCode).toBe(409);
  let state = await act({ action: 'assign', expectedVersion: 1, assigneeUserId: f.ownerId });
  state = await act({ action: 'start', expectedVersion: state.version });
  state = await act({ action: 'resolve', expectedVersion: state.version, note: 'Washer replaced' });
  expect(state.status).toBe('resolved');
  const reopened = complaintDetailSchema.parse(
    (
      await resident({ action: 'reopen', expectedVersion: state.version, note: 'Still dripping' })
    ).json(),
  );
  expect(reopened).toMatchObject({ status: 'reopened', reopenCount: 1 });
  state = await act({ action: 'resolve', expectedVersion: reopened.version, note: 'Tap replaced' });
  const closed = complaintDetailSchema.parse(
    (await resident({ action: 'accept', expectedVersion: state.version })).json(),
  );
  expect(closed.status).toBe('closed');
  expect(closed.events.map((event) => event.toStatus)).toEqual([
    'open',
    'assigned',
    'in_progress',
    'resolved',
    'reopened',
    'resolved',
    'closed',
  ]);
  await expect(
    f.connection.db.delete(complaintEvents).where(eq(complaintEvents.complaintId, created.id)),
  ).rejects.toThrow();
  // Private attachment: own resident and branch staff get a link; another customer does not.
  expect(
    (await h.get(`${own}/${created.id}/attachments/${fileId}`, f.customerAToken)).statusCode,
  ).toBe(200);
  expect(
    (await h.get(`/v1/branches/${item.branchId}/complaints/${created.id}/attachments/${fileId}`))
      .statusCode,
  ).toBe(200);
  expect((await h.get(`${own}/${created.id}`, f.customerBToken)).statusCode).toBe(404);
  // A Manager without stay_manage reads the queue but cannot act; revocation is immediate.
  const assignmentId = randomUUID();
  await f.connection.db.insert(managerAssignments).values({
    id: assignmentId,
    userId: f.customerB,
    branchId: item.branchId,
    status: 'active',
    appointedByUserId: f.ownerId,
    activatedAt: f.now,
  });
  try {
    expect(
      (await h.get(`/v1/branches/${item.branchId}/complaints`, f.customerBToken)).statusCode,
    ).toBe(200);
    const second = complaintDetailSchema.parse(
      await h.ok(
        own,
        { category: 'wifi', title: 'No Wi-Fi', description: 'Router down' },
        f.customerAToken,
      ),
    );
    expect(
      (
        await h.send(
          `/v1/branches/${item.branchId}/complaints/${second.id}/actions`,
          { action: 'start', expectedVersion: 1 },
          f.customerBToken,
        )
      ).statusCode,
    ).toBe(403);
  } finally {
    await f.connection.db
      .delete(managerInventoryGrants)
      .where(eq(managerInventoryGrants.assignmentId, assignmentId));
    await f.connection.db
      .update(managerAssignments)
      .set({ status: 'deactivated' })
      .where(eq(managerAssignments.id, assignmentId));
  }
  // CMP-006: after checkout no new complaint, history still readable.
  await h.ok(base + '/checkout', {
    expectedVersion: await h.version(stay.stayId),
    reason: 'Left',
    applyAvailableDeposit: false,
  });
  expect(
    (
      await h.send(
        own,
        { category: 'other', title: 'Late', description: 'After leaving' },
        f.customerAToken,
      )
    ).statusCode,
  ).toBe(403);
  expect((await h.get(`${own}/${created.id}`, f.customerAToken)).statusCode).toBe(200);
});
it('REV-001..006: 30-day verified eligibility, one review per Stay, public privacy and replies', async () => {
  const f = h.fixture();
  const { item, stay, base } = await h.admitted(fullPeriod, '2026-09-25');
  const url = `/v1/me/stays/${stay.stayId}/review`;
  const eligibility = async () =>
    reviewEligibilitySchema.parse(
      (await h.get(`/v1/me/stays/${stay.stayId}/review-eligibility`, f.customerAToken)).json(),
    );
  expect(await eligibility()).toMatchObject({ eligible: false, reason: 'too_early' });
  expect((await h.send(url, { ratings }, f.customerAToken)).statusCode).toBe(403);
  await h.moveTo('2026-07-24T10:00:00Z');
  expect((await eligibility()).reason).toBe('too_early');
  await h.moveTo('2026-07-25T10:00:00Z');
  expect(await eligibility()).toMatchObject({ eligible: true, eligibleFrom: '2026-07-25' });
  expect((await h.send(url, { ratings }, f.customerBToken)).statusCode).toBe(404);
  const raced = await Promise.all([
    h.send(url, { ratings, body: 'Clean rooms, slow Wi-Fi' }, f.customerAToken),
    h.send(url, { ratings }, f.customerAToken),
  ]);
  const codes = raced.map((row) => row.statusCode).sort();
  expect(codes[0]).toBe(201);
  expect([403, 409]).toContain(codes[1]);
  expect(
    await f.connection.db.select().from(reviews).where(eq(reviews.stayId, stay.stayId)),
  ).toHaveLength(1);
  const created = ownReviewSchema.parse(raced.find((row) => row.statusCode === 201)?.json());
  const patch = await f.application.inject({
    method: 'PATCH',
    url,
    headers: { authorization: 'Bearer ' + f.customerAToken, 'Idempotency-Key': randomUUID() },
    payload: {
      ratings: { ...ratings, wifi: 3 },
      body: 'Clean rooms; Wi-Fi improved',
      expectedVersion: created.version,
    },
  });
  expect(patch.statusCode, patch.body).toBe(200);
  const edited = ownReviewSchema.parse(patch.json());
  expect(edited.ratings.wifi).toBe(3);
  const replied = await f.application.inject({
    method: 'PUT',
    url: `/v1/branches/${item.branchId}/reviews/${created.id}/reply`,
    headers: { authorization: 'Bearer ' + f.ownerToken, 'Idempotency-Key': randomUUID() },
    payload: { body: 'Thank you; the router was replaced.' },
  });
  expect(replied.statusCode, replied.body).toBe(200);
  const listing = await h.get(`/v1/public/branches/${item.branchId}/reviews`);
  if (listing.statusCode === 200) {
    const page = publicReviewPageSchema.parse(listing.json());
    expect(page.data[0]).toMatchObject({
      verifiedStay: true,
      reply: { body: 'Thank you; the router was replaced.' },
    });
    // BR-05: no private field names in the public payload (review text is the author's own).
    const keys = JSON.stringify(page, (key, value: unknown) => (key === 'body' ? '' : value));
    expect(keys).not.toMatch(/seat|room|bed|phone|cnic|paisa|stayId|userId/i);
    expect(page.summary).toMatchObject({ count: 1 });
  } else expect(listing.statusCode).toBe(404);
  const report = await h.send(`/v1/reviews/${created.id}/reports`, { reason: 'spam' });
  expect(report.statusCode, report.body).toBe(201);
  expect((await h.send(`/v1/reviews/${created.id}/reports`, { reason: 'spam' })).statusCode).toBe(
    409,
  );
  // REV-002: eligibility remains after checkout; the review stays.
  await h.ok(base + '/checkout', {
    expectedVersion: await h.version(stay.stayId),
    reason: 'Left',
    applyAvailableDeposit: false,
  });
  expect((await eligibility()).reason).toBe('already_reviewed');
  await expect(f.connection.db.delete(reviews).where(eq(reviews.id, created.id))).rejects.toThrow();
});
