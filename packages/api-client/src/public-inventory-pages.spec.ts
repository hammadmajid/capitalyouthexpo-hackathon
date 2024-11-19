import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import {
  marketplaceOverview,
  listPublicInventoryRoomTypes,
  listPublicInventoryRooms,
  listPublicInventoryBeds,
} from './public-inventory-pages.js';
const first = '019a1234-1234-7123-8123-123456789abc',
  second = '019a1234-1234-7123-8123-123456789abd',
  branchId = '019a1234-1234-7123-8123-123456789abe';
const type = {
  id: first,
  name: 'Shared',
  capacity: 2,
  inventoryMode: 'both',
  bedMonthlyRentPaisa: 1800001,
  roomMonthlyRentPaisa: 3200000,
  depositPaisa: 0,
  amenities: [],
  fees: [],
};
const page = { branchId, data: [type], nextCursor: null },
  dates = { moveInDate: '2026-11-01', moveOutDate: '2026-11-03' };
function fixture(response: unknown, status = 200) {
  const requests: Request[] = [],
    token = vi.fn(async () => undefined);
  const client = createApiClient({
    baseUrl: 'https://example.test',
    authentication: { kind: 'bearer', accessToken: token },
    fetch: async (value, init) => {
      requests.push(value instanceof Request ? value : new Request(value, init));
      return Response.json(response, { status });
    },
  });
  return { client, requests, token };
}
function sent(store: ReturnType<typeof fixture>) {
  const value = store.requests[0];
  if (!value) throw new Error('Missing request');
  return new URL(value.url);
}
it('ACC-002 / P2-S1: anonymous public type page has canonical scope, exact paisa and no token loading', async () => {
  const store = fixture(page);
  expect(await listPublicInventoryRoomTypes(store.client, branchId.toUpperCase())).toEqual(page);
  expect(sent(store).pathname).toBe('/v1/marketplace/' + branchId + '/inventory/pages/room-types');
  expect(sent(store).searchParams.get('limit')).toBe('20');
  expect(sent(store).searchParams.has('cursor')).toBe(false);
  expect(sent(store).searchParams.has('moveInDate')).toBe(false);
  expect(store.token).not.toHaveBeenCalled();
});
it('ACC-002: page continuation sends only the current exact cursor and preserves dates', async () => {
  const store = fixture({ ...page, data: [{ ...type, id: second }] });
  await listPublicInventoryRoomTypes(store.client, branchId, {
    ...dates,
    cursor: first.toUpperCase(),
    limit: 1,
  });
  expect(Object.fromEntries(sent(store).searchParams)).toEqual({
    ...dates,
    cursor: first,
    limit: '1',
  });
  await expect(
    listPublicInventoryRoomTypes(fixture(page).client, branchId, { cursor: first }),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it.each([
  { ...page, branchId: first, data: [] },
  { ...page, data: [type, type] },
  { ...page, nextCursor: second },
  { ...page, nextCursor: first },
  { ...page, data: [{ ...type, depositPaisa: 9007199254740992 }] },
])(
  'ACC-002: malformed/cross-branch/noncanonical continuation data is rejected',
  async (response) => {
    await expect(
      listPublicInventoryRoomTypes(fixture(response).client, branchId),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  },
);
it('ACC-002: the requested limit remains authoritative even for otherwise valid rows', async () => {
  await expect(
    listPublicInventoryRoomTypes(
      fixture({ ...page, data: [type, { ...type, id: second }] }).client,
      branchId,
      { limit: 1 },
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('ACC-002: genuine empty collections preserve exact branch and parent binding', async () => {
  expect(
    await listPublicInventoryRoomTypes(fixture({ ...page, data: [] }).client, branchId),
  ).toEqual({ ...page, data: [] });
  const roomPage = { branchId, roomTypeId: first, data: [], nextCursor: null },
    bedPage = { branchId, roomId: second, data: [], nextCursor: null };
  const room = fixture(roomPage),
    bed = fixture(bedPage);
  expect(await listPublicInventoryRooms(room.client, branchId, first)).toEqual(roomPage);
  expect(await listPublicInventoryBeds(bed.client, branchId, second)).toEqual(bedPage);
  expect(sent(room).pathname).toBe(
    '/v1/marketplace/' + branchId + '/inventory/pages/room-types/' + first + '/rooms',
  );
  expect(sent(bed).pathname).toBe(
    '/v1/marketplace/' + branchId + '/inventory/pages/rooms/' + second + '/beds',
  );
  await expect(
    listPublicInventoryRooms(fixture({ ...roomPage, roomTypeId: second }).client, branchId, first),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  await expect(
    listPublicInventoryBeds(fixture({ ...bedPage, roomId: first }).client, branchId, second),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('ACC-002: dated availability is explicit; undated data cannot claim a date-specific available state', async () => {
  const roomPage = {
    branchId,
    roomTypeId: first,
    data: [{ id: second, label: '101', wholeRoomAvailable: null, photoIds: [second] }],
    nextCursor: null,
  };
  const bedPage = {
    branchId,
    roomId: first,
    data: [{ id: second, label: 'A', available: null, photoIds: [second] }],
    nextCursor: null,
  };
  await expect(
    listPublicInventoryRooms(fixture(roomPage).client, branchId, first, dates),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  await expect(
    listPublicInventoryBeds(fixture(bedPage).client, branchId, first, dates),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  await expect(
    listPublicInventoryRooms(
      fixture({ ...roomPage, data: [{ ...roomPage.data[0], wholeRoomAvailable: true }] }).client,
      branchId,
      first,
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  await expect(
    listPublicInventoryBeds(
      fixture({ ...bedPage, data: [{ ...bedPage.data[0], available: true }] }).client,
      branchId,
      first,
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  expect(
    (
      await listPublicInventoryBeds(
        fixture({
          ...bedPage,
          data: [{ id: second, label: 'A', available: false, photoIds: [second] }],
        }).client,
        branchId,
        first,
        dates,
      )
    ).data[0]?.available,
  ).toBe(false);
});
it('ACC-002: invalid date/cursor/limit is rejected before network access', async () => {
  const store = fixture(page);
  for (const input of [{ cursor: 'bad' }, { limit: 101 }, { moveInDate: '2026-11-01' }])
    await expect(listPublicInventoryRoomTypes(store.client, branchId, input)).rejects.toBeDefined();
  expect(store.requests).toHaveLength(0);
});
it('ACC-002: overview is anonymous, bound to the requested listing and has no physical arrays', async () => {
  const value = {
    branchId,
    brandName: 'HSM',
    name: 'Hostel',
    slug: 'hostel',
    category: 'boys',
    city: 'Islamabad',
    area: null,
    latitude: 33.7,
    longitude: 73,
    priceFromPaisa: 1800001,
    verified: true,
    availableBeds: null,
    availableWholeRooms: null,
    amenities: [],
    media: [],
    distanceMeters: null,
    description: null,
    address: 'Public address',
    landmark: null,
    publicPhone: null,
    publicEmail: null,
  };
  const store = fixture(value);
  expect(await marketplaceOverview(store.client, branchId.toUpperCase())).toEqual(value);
  expect(sent(store).pathname).toBe('/v1/marketplace/' + branchId);
  expect(store.token).not.toHaveBeenCalled();
  await expect(
    marketplaceOverview(fixture({ ...value, branchId: first }).client, branchId),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  await expect(
    marketplaceOverview(fixture({ ...value, roomTypes: [] }).client, branchId),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('ACC-002: withdrawal remains an authoritative error rather than empty inventory', async () => {
  const store = fixture(
    {
      type: 'https://example.test/problem',
      title: 'Unavailable',
      status: 404,
      code: 'NOT_FOUND',
      detail: 'Listing unavailable',
      traceId: 'fixture',
    },
    404,
  );
  await expect(listPublicInventoryRoomTypes(store.client, branchId)).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
});
