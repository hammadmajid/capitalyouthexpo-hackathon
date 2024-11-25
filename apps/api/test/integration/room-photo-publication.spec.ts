import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { files, listingMedia, rooms } from '@hsm/db';
import {
  galleryMediaSchema,
  galleryPageSchema,
  listingPageSchema,
  publicGalleryPageSchema,
  publicInventoryBedPageSchema,
  publicInventoryRoomPageSchema,
} from '@hsm/contracts';
import { verifiedKey } from '@hsm/files';
import { phaseTwoFixture } from './phase-two-fixture.js';
let f: Awaited<ReturnType<typeof phaseTwoFixture>>;
let bytes: Buffer;
type Item = Awaited<ReturnType<typeof f.inventory>>;
beforeAll(async () => {
  bytes = await readFile(new URL('./fixtures/gallery.png', import.meta.url));
  f = await phaseTwoFixture(new Date('2026-10-25T10:00:00Z'));
});
afterAll(async () => {
  await f?.close();
});
const owner = () => ({ authorization: 'Bearer ' + f.ownerToken });
const range = { moveInDate: '2026-11-01', moveOutDate: '2026-12-01' };
async function image() {
  const id = randomUUID(),
    key = verifiedKey('listing_photo', id);
  await f.storage.storage.putVerified(key, 'image/png', bytes);
  await f.connection.db.insert(files).values({
    id,
    uploadedBy: f.ownerId,
    bucket: f.storage.bucket,
    visibility: 'private',
    objectKey: key,
    mimeType: 'image/png',
    sizeBytes: BigInt(bytes.length),
    purpose: 'listing_photo',
    scanStatus: 'clean',
    sha256: createHash('sha256').update(bytes).digest(),
  });
  return id;
}
async function attach(item: Item, target?: Record<string, string>) {
  const response = await f.application.inject({
    method: 'POST',
    url: `/v1/branches/${item.branchId}/gallery`,
    headers: { ...owner(), 'Idempotency-Key': randomUUID() },
    payload: {
      fileId: await image(),
      altText: 'Photo',
      sortOrder: 0,
      ...(target ? { target } : {}),
    },
  });
  return response;
}
async function publish(item: Item, target: Record<string, string>) {
  const attached = await attach(item, target);
  expect(attached.statusCode, attached.body).toBe(201);
  const draft = galleryMediaSchema.parse(attached.json());
  const published = await f.application.inject({
    method: 'PUT',
    url: `/v1/branches/${item.branchId}/gallery/${draft.id}`,
    headers: { ...owner(), 'Idempotency-Key': randomUUID(), 'If-Match': `"${draft.version}"` },
    payload: { altText: 'Photo', sortOrder: 0, published: true },
  });
  expect(published.statusCode, published.body).toBe(200);
  return galleryMediaSchema.parse(published.json());
}
function quote(item: Item, target: Record<string, string>) {
  return f.application.inject({
    method: 'POST',
    url: `/v1/marketplace/${item.branchId}/quote`,
    payload: { target, range },
  });
}
async function pages(item: Item) {
  const roomPage = await f.application.inject({
    url: `/v1/marketplace/${item.branchId}/inventory/pages/room-types/${item.roomTypeId}/rooms`,
  });
  expect(roomPage.statusCode, roomPage.body).toBe(200);
  const bedPage = await f.application.inject({
    url: `/v1/marketplace/${item.branchId}/inventory/pages/rooms/${item.roomId}/beds`,
  });
  return {
    rooms: publicInventoryRoomPageSchema.parse(roomPage.json()).data,
    beds: bedPage.statusCode === 200 ? publicInventoryBedPageSchema.parse(bedPage.json()).data : [],
    bedStatus: bedPage.statusCode,
  };
}
async function summary(item: Item, availableOnly = false) {
  const response = await f.application.inject({
    url: `/v1/marketplace?ids=${item.branchId}&moveInDate=2026-11-01&moveOutDate=2026-12-01&availableOnly=${availableOnly}`,
  });
  expect(response.statusCode, response.body).toBe(200);
  return listingPageSchema.parse(response.json()).data[0];
}
it('ROOM-003 / SEAT-002: unphotographed inventory stays internal across pages, search, quotes and holds', async () => {
  const item = await f.inventory({ photos: false });
  expect(await pages(item)).toMatchObject({ rooms: [], bedStatus: 404 });
  expect((await summary(item))?.priceFromPaisa ?? null).toBeNull();
  expect(await summary(item, true)).toBeUndefined();
  const bed = { kind: 'bed', roomId: item.roomId, bedId: item.seatId };
  expect((await quote(item, bed)).statusCode).toBe(404);
  expect((await quote(item, { kind: 'room', roomId: item.roomId })).statusCode).toBe(404);
  const listed = await f.inventory();
  const captured = await quote(listed, {
    kind: 'bed',
    roomId: listed.roomId,
    bedId: listed.seatId,
  });
  expect(captured.statusCode, captured.body).toBe(200);
  await f.connection.db
    .update(listingMedia)
    .set({ archivedAt: f.now })
    .where(eq(listingMedia.seatId, listed.seatId));
  const customer = { authorization: 'Bearer ' + f.customerAToken };
  for (const [suffix, payload] of [
    ['holds', { quote: captured.json() }],
    ['bookings', { quote: captured.json(), documents: [], permanentAddress: 'Fixture address' }],
  ] as const) {
    const response = await f.application.inject({
      method: 'POST',
      url: `/v1/marketplace/${listed.branchId}/${suffix}`,
      headers: { ...customer, 'Idempotency-Key': randomUUID() },
      payload,
    });
    expect(response.statusCode, response.body).toBe(404);
  }
});
it('ROOM-003 / ROOM-004: a room photo enables the room; each bed additionally needs its own photo', async () => {
  const item = await f.inventory({ photos: false });
  const roomPhoto = await publish(item, { kind: 'room', roomId: item.roomId });
  const afterRoom = await pages(item);
  expect(afterRoom.rooms).toEqual([
    expect.objectContaining({ id: item.roomId, photoIds: [roomPhoto.id] }),
  ]);
  expect(afterRoom.beds).toEqual([]);
  expect((await quote(item, { kind: 'room', roomId: item.roomId })).statusCode).toBe(200);
  const bed = { kind: 'bed', roomId: item.roomId, bedId: item.seatId };
  expect((await quote(item, bed)).statusCode).toBe(404);
  const bedPhoto = await publish(item, bed);
  expect(bedPhoto).toMatchObject({ roomId: item.roomId, bedId: item.seatId });
  const afterBed = await pages(item);
  expect(afterBed.beds).toEqual([
    expect.objectContaining({ id: item.seatId, photoIds: [bedPhoto.id] }),
  ]);
  expect((await quote(item, bed)).statusCode).toBe(200);
  expect((await summary(item, true))?.availableBeds).toBe(1);
  const served = await f.application.inject({ url: `/v1/marketplace/media/${bedPhoto.id}` });
  expect(served.statusCode).toBe(200);
  expect(Buffer.compare(served.rawPayload, bytes)).toBe(0);
  const gallery = await f.application.inject({ url: `/v1/marketplace/${item.branchId}/gallery` });
  expect(gallery.statusCode, gallery.body).toBe(200);
  expect(publicGalleryPageSchema.parse(gallery.json()).data).toEqual([]);
  const scoped = await f.application.inject({
    url: `/v1/branches/${item.branchId}/gallery?roomId=${item.roomId}&bedId=${item.seatId}`,
    headers: owner(),
  });
  expect(galleryPageSchema.parse(scoped.json()).data.map((row) => row.id)).toEqual([bedPhoto.id]);
  const hostel = await f.application.inject({
    url: `/v1/branches/${item.branchId}/gallery`,
    headers: owner(),
  });
  expect(galleryPageSchema.parse(hostel.json()).data).toEqual([]);
});
it('SEC-003 / ROOM-003: scan revocation or archival of the bed photo immediately withdraws the bed', async () => {
  const item = await f.inventory({ photos: false });
  await publish(item, { kind: 'room', roomId: item.roomId });
  const bed = { kind: 'bed', roomId: item.roomId, bedId: item.seatId };
  const photo = await publish(item, bed);
  expect((await quote(item, bed)).statusCode).toBe(200);
  await f.connection.db
    .update(files)
    .set({ scanStatus: 'rejected' })
    .where(eq(files.id, photo.fileId));
  expect((await quote(item, bed)).statusCode).toBe(404);
  expect((await pages(item)).beds).toEqual([]);
  await f.connection.db
    .update(files)
    .set({ scanStatus: 'clean' })
    .where(eq(files.id, photo.fileId));
  const current = galleryPageSchema.parse(
    (
      await f.application.inject({
        url: `/v1/branches/${item.branchId}/gallery?roomId=${item.roomId}&bedId=${item.seatId}`,
        headers: owner(),
      })
    ).json(),
  ).data[0];
  if (!current) throw new Error('Fixture bed photo missing');
  const archived = await f.application.inject({
    method: 'POST',
    url: `/v1/branches/${item.branchId}/gallery/${photo.id}/archive`,
    headers: { ...owner(), 'Idempotency-Key': randomUUID(), 'If-Match': `"${current.version}"` },
    payload: { reason: 'Replaced bed photo' },
  });
  expect(archived.statusCode, archived.body).toBe(200);
  expect((await quote(item, bed)).statusCode).toBe(404);
});
it('ACC-002 / AUD-001: photo targets are branch-scoped, current and immutable', async () => {
  const item = await f.inventory({ photos: false }),
    other = await f.inventory({ photos: false });
  expect((await attach(item, { kind: 'room', roomId: other.roomId })).statusCode).toBe(404);
  expect(
    (await attach(item, { kind: 'bed', roomId: item.roomId, bedId: other.seatId })).statusCode,
  ).toBe(404);
  await f.connection.db.update(rooms).set({ archivedAt: f.now }).where(eq(rooms.id, other.roomId));
  expect((await attach(other, { kind: 'room', roomId: other.roomId })).statusCode).toBe(404);
  const photo = await publish(item, { kind: 'room', roomId: item.roomId });
  await expect(
    f.connection.db.update(listingMedia).set({ roomId: null }).where(eq(listingMedia.id, photo.id)),
  ).rejects.toThrow();
  await expect(
    f.connection.db.insert(listingMedia).values({
      id: randomUUID(),
      branchId: item.branchId,
      fileId: photo.fileId,
      seatId: item.seatId,
      sortOrder: 1,
      altText: 'Bed without room',
    }),
  ).rejects.toThrow();
});
