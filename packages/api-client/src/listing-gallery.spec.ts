import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import type { GalleryMedia } from '@hsm/contracts';
import { createApiClient, type ApiClient } from './client.js';
import {
  archiveListingImage,
  attachListingImage,
  editListingImage,
  listListingGallery,
  selectListingCover,
} from './listing-gallery.js';
const branchId = randomUUID(),
  mediaId = randomUUID(),
  fileId = randomUUID(),
  key = randomUUID(),
  version = 'a'.repeat(64),
  now = '2026-10-16T10:00:00.000Z';
const media: GalleryMedia = {
  id: mediaId,
  branchId,
  fileId,
  altText: 'Exterior',
  sortOrder: 0,
  roomId: null,
  bedId: null,
  scanStatus: 'clean',
  publishedAt: null,
  archivedAt: null,
  version,
};
function wire(body: unknown, status = 200) {
  const requests: Request[] = [];
  const client = createApiClient({
    baseUrl: 'https://example.test',
    authentication: { kind: 'cookie', csrf: () => 'fixture-csrf' },
    fetch: async (input, init) => {
      requests.push(input instanceof Request ? input : new Request(input, init));
      return Response.json(body, { status });
    },
  });
  function request() {
    const result = requests[0];
    if (!result) throw new Error('Missing request');
    return result;
  }
  return { client, request, requests };
}
const cases: {
  name: string;
  suffix: string;
  method: string;
  body: unknown;
  response: GalleryMedia;
  call: (client: ApiClient) => Promise<GalleryMedia>;
}[] = [
  {
    name: 'attach',
    suffix: '',
    method: 'POST',
    body: { fileId, altText: 'Exterior', sortOrder: 0 },
    response: media,
    call: (client) =>
      attachListingImage(
        client,
        branchId.toUpperCase(),
        { fileId: fileId.toUpperCase(), altText: ' Exterior ', sortOrder: 0 },
        key,
      ),
  },
  {
    name: 'publish',
    suffix: '/' + mediaId,
    method: 'PUT',
    body: { altText: 'Exterior', sortOrder: 0, published: true },
    response: { ...media, publishedAt: now },
    call: (client) =>
      editListingImage(
        client,
        branchId,
        mediaId,
        version,
        { altText: 'Exterior', sortOrder: 0, published: true },
        key,
      ),
  },
  {
    name: 'archive',
    suffix: '/' + mediaId + '/archive',
    method: 'POST',
    body: { reason: 'Replaced' },
    response: { ...media, archivedAt: now },
    call: (client) => archiveListingImage(client, branchId, mediaId, version, ' Replaced ', key),
  },
  {
    name: 'cover',
    suffix: '/' + mediaId + '/cover',
    method: 'POST',
    body: {},
    response: media,
    call: (client) => selectListingCover(client, branchId, mediaId, version, key),
  },
];
it.each(cases)(
  'ROOM-003: $name sends the exact protected path, explicit body, CSRF and stable key',
  async (operation) => {
    const value = wire(operation.response, operation.name === 'attach' ? 201 : 200);
    expect(await operation.call(value.client)).toEqual(operation.response);
    expect(new URL(value.request().url).pathname).toBe(
      '/v1/branches/' + branchId + '/gallery' + operation.suffix,
    );
    expect(value.request().method).toBe(operation.method);
    expect(await value.request().json()).toEqual(operation.body);
    expect(value.request().headers.get('Idempotency-Key')).toBe(key);
    expect(value.request().headers.get('X-CSRF-Token')).toBe('fixture-csrf');
    expect(value.request().headers.get('If-Match')).toBe(
      operation.name === 'attach' ? null : '"' + version + '"',
    );
  },
);
it('ROOM-003: list reads bind every returned image to the selected branch and preserve actual cursor', async () => {
  const page = { data: [media], nextCursor: mediaId, canEdit: false, canPublish: false },
    value = wire(page);
  expect(
    await listListingGallery(value.client, branchId.toUpperCase(), {
      cursor: mediaId,
      state: 'archived',
      limit: 10,
    }),
  ).toEqual(page);
  const url = new URL(value.request().url);
  expect(url.searchParams.get('cursor')).toBe(mediaId);
  expect(url.searchParams.get('state')).toBe('archived');
  expect(url.searchParams.get('limit')).toBe('10');
  expect(value.request().headers.has('Idempotency-Key')).toBe(false);
  const initial = wire({ data: [], nextCursor: null, canEdit: true, canPublish: true });
  await listListingGallery(initial.client, branchId);
  expect(new URL(initial.request().url).searchParams.has('cursor')).toBe(false);
});
it('SEC-003: another branch cannot enter a gallery page', async () => {
  await expect(
    listListingGallery(
      wire({
        data: [{ ...media, branchId: randomUUID() }],
        nextCursor: null,
        canEdit: true,
        canPublish: true,
      }).client,
      branchId,
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it.each(cases)('SEC-003: $name rejects another branch response', async (operation) => {
  await expect(
    operation.call(wire({ ...operation.response, branchId: randomUUID() }).client),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it.each(cases.slice(1))(
  'SEC-003: $name rejects a response for another image',
  async (operation) => {
    await expect(
      operation.call(wire({ ...operation.response, id: randomUUID() }).client),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  },
);
it('SEC-003: attachment cannot accept another file or imply immediate publication/archival', async () => {
  for (const patch of [
    { fileId: randomUUID() },
    { publishedAt: now },
    { archivedAt: now },
    { scanStatus: 'rejected' },
  ])
    await expect(
      attachListingImage(
        wire({ ...media, ...patch }).client,
        branchId,
        { fileId, altText: 'Exterior', sortOrder: 0 },
        key,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('ROOM-003: edit success requires the actual requested metadata and publication state', async () => {
  for (const patch of [
    { altText: 'Other' },
    { sortOrder: 1 },
    { publishedAt: null },
    { archivedAt: now },
    { scanStatus: 'rejected' },
  ])
    await expect(
      editListingImage(
        wire({ ...media, publishedAt: now, ...patch }).client,
        branchId,
        mediaId,
        version,
        { altText: 'Exterior', sortOrder: 0, published: true },
        key,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  expect(
    await editListingImage(
      wire({ ...media, scanStatus: 'rejected' }).client,
      branchId,
      mediaId,
      version,
      { altText: 'Exterior', sortOrder: 0, published: false },
      key,
    ),
  ).toMatchObject({ publishedAt: null });
});
it('ROOM-003: archive and cover cannot report success with unapplied state', async () => {
  await expect(
    archiveListingImage(wire(media).client, branchId, mediaId, version, 'Replaced', key),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  for (const patch of [{ sortOrder: 1 }, { archivedAt: now }, { scanStatus: 'pending' }])
    await expect(
      selectListingCover(wire({ ...media, ...patch }).client, branchId, mediaId, version, key),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('SEC-003: private storage additions and invalid inputs fail closed', async () => {
  await expect(
    listListingGallery(
      wire({
        data: [{ ...media, objectKey: 'private/key' }],
        nextCursor: null,
        canEdit: true,
        canPublish: true,
      }).client,
      branchId,
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  const value = wire(media);
  await expect(listListingGallery(value.client, branchId, { limit: 101 })).rejects.toThrow();
  await expect(
    attachListingImage(
      value.client,
      branchId,
      { fileId, altText: 'Exterior', sortOrder: 0, published: true },
      key,
    ),
  ).rejects.toThrow();
  await expect(selectListingCover(value.client, 'bad', mediaId, version, key)).rejects.toThrow();
  await expect(
    selectListingCover(value.client, branchId, mediaId, '"' + version + '"', key),
  ).rejects.toThrow();
  await expect(
    selectListingCover(value.client, branchId, mediaId, version, 'bad'),
  ).rejects.toThrow();
  expect(value.requests).toHaveLength(0);
});
it('ROOM-003: typed stale-image errors survive the SDK boundary', async () => {
  const value = wire(
    {
      type: 'about:blank',
      title: 'Precondition failed',
      detail: 'Changed',
      traceId: randomUUID(),
      status: 412,
      code: 'PRECONDITION_FAILED',
    },
    412,
  );
  await expect(
    selectListingCover(value.client, branchId, mediaId, version, key),
  ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
});
it('ROOM-002/003: room and bed photo targets are sent and bound to the exact returned scope', async () => {
  const roomId = randomUUID(),
    bedId = randomUUID(),
    target = { kind: 'bed', roomId, bedId },
    attached = { ...media, roomId, bedId },
    value = wire(attached, 201);
  expect(
    await attachListingImage(
      value.client,
      branchId,
      { fileId, altText: 'Bed', sortOrder: 0, target },
      key,
    ),
  ).toEqual(attached);
  expect(await value.request().json()).toEqual({ fileId, altText: 'Bed', sortOrder: 0, target });
  for (const patch of [
    { roomId: null, bedId: null },
    { bedId: randomUUID() },
    { roomId: randomUUID() },
  ])
    await expect(
      attachListingImage(
        wire({ ...attached, ...patch }, 201).client,
        branchId,
        { fileId, altText: 'Bed', sortOrder: 0, target },
        key,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  const page = { data: [attached], nextCursor: null, canEdit: true, canPublish: true },
    scoped = wire(page);
  expect(await listListingGallery(scoped.client, branchId, { roomId, bedId })).toEqual(page);
  const url = new URL(scoped.request().url);
  expect(url.searchParams.get('roomId')).toBe(roomId);
  expect(url.searchParams.get('bedId')).toBe(bedId);
  await expect(listListingGallery(wire(page).client, branchId, { roomId })).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
  await expect(listListingGallery(wire(page).client, branchId)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
  await expect(listListingGallery(wire(page).client, branchId, { bedId })).rejects.toThrow();
});
