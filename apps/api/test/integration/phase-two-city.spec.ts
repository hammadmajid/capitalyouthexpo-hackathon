import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { cities, files, listingMedia } from '@hsm/db';
import { listingPageSchema, bookingQuoteSnapshotSchema } from '@hsm/contracts';
import { verifiedKey } from '@hsm/files';
import { phaseTwoFixture } from './phase-two-fixture.js';
let fixture: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  fixture = await phaseTwoFixture(new Date('2026-10-15T10:00:00Z'));
});
afterAll(async () => {
  await fixture?.close();
});
async function privateFile(
  purpose: 'resident_document' | 'listing_photo',
  bytes: Buffer,
  mimeType: string,
) {
  const id = randomUUID(),
    key = verifiedKey(purpose, id);
  await fixture.storage.storage.putVerified(key, mimeType, bytes);
  // Prepared clean fixture; actual content/ClamAV validation remains a separate blocking suite.
  await fixture.connection.db.insert(files).values({
    id,
    uploadedBy: purpose === 'listing_photo' ? fixture.ownerId : fixture.customerA,
    bucket: fixture.storage.bucket,
    visibility: 'private',
    objectKey: key,
    purpose,
    scanStatus: 'clean',
    mimeType,
    sizeBytes: BigInt(bytes.length),
    sha256: createHash('sha256').update(bytes).digest(),
  });
  return { id, key };
}
it('ACC-002 / BKG-001: real inactive city hides direct images/details and denies quotes, holds and new document sharing', async () => {
  const inventory = await fixture.inventory();
  const png = Buffer.from(
    // eslint-disable-next-line no-secrets/no-secrets -- Public one-pixel PNG fixture, not a credential.
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=',
    'base64',
  );
  const image = await privateFile('listing_photo', png, 'image/png'),
    mediaId = randomUUID();
  await fixture.connection.db.insert(listingMedia).values({
    id: mediaId,
    branchId: inventory.branchId,
    fileId: image.id,
    sortOrder: 0,
    altText: 'Integration fixture image',
    publishedAt: fixture.now,
    publishedByUserId: fixture.ownerId,
  });
  const document = await privateFile(
    'resident_document',
    Buffer.from('Prepared private document fixture'),
    'application/pdf',
  );
  const headers = () => ({
    authorization: `Bearer ${fixture.customerAToken}`,
    'Idempotency-Key': randomUUID(),
  });
  const quoteRequest = {
    method: 'POST' as const,
    url: `/v1/marketplace/${inventory.branchId}/quote`,
    payload: {
      target: { kind: 'bed', roomId: inventory.roomId, bedId: inventory.seatId },
      range: { moveInDate: '2026-11-01', moveOutDate: '2026-11-03' },
    },
  };
  const sharing = {
    method: 'POST' as const,
    url: `/v1/me/booking-documents/${inventory.branchId}`,
    payload: { kind: 'student_id', fileId: document.id, shareWithOwner: true },
  };
  const initialQuote = await fixture.application.inject(quoteRequest);
  expect(initialQuote.statusCode).toBe(200);
  const quote = bookingQuoteSnapshotSchema.parse(initialQuote.json());
  const published = await fixture.application.inject({ url: `/v1/marketplace/media/${mediaId}` });
  expect(published.statusCode).toBe(200);
  expect(published.rawPayload).toEqual(png);
  expect((await fixture.application.inject({ ...sharing, headers: headers() })).statusCode).toBe(
    201,
  );
  try {
    await fixture.connection.db
      .update(cities)
      .set({ isActive: false })
      .where(eq(cities.id, fixture.cityId));
    const list = await fixture.application.inject({
      url: `/v1/marketplace?ids=${inventory.branchId}`,
    });
    expect(list.statusCode).toBe(200);
    expect(listingPageSchema.parse(list.json()).data).toHaveLength(0);
    expect(
      (await fixture.application.inject({ url: `/v1/marketplace/${inventory.branchId}` }))
        .statusCode,
    ).toBe(404);
    expect((await fixture.application.inject(quoteRequest)).statusCode).toBe(404);
    expect(
      (
        await fixture.application.inject({
          method: 'POST',
          url: `/v1/marketplace/${inventory.branchId}/holds`,
          headers: headers(),
          payload: { quote },
        })
      ).statusCode,
    ).toBe(404);
    expect((await fixture.application.inject({ ...sharing, headers: headers() })).statusCode).toBe(
      404,
    );
    const hidden = await fixture.application.inject({ url: `/v1/marketplace/media/${mediaId}` });
    expect(hidden.statusCode).toBe(404);
    expect(hidden.body).not.toContain(image.key);
  } finally {
    await fixture.connection.db
      .update(cities)
      .set({ isActive: true })
      .where(eq(cities.id, fixture.cityId));
  }
});
