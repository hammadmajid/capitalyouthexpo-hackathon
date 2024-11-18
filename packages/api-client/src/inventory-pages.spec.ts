import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import {
  readInventoryAccess,
  listInventoryRoomTypes,
  listInventoryRooms,
  listInventoryBeds,
} from './inventory-pages.js';
const first = '019a1234-1234-7123-8123-123456789abc',
  second = '019a1234-1234-7123-8123-123456789abd',
  branchId = '019a1234-1234-7123-8123-123456789abe';
const access = { branchId, permissions: [], canConfigureManagers: false };
const type = {
  id: first,
  branchId,
  name: 'Shared',
  inventoryMode: 'both',
  capacity: 2,
  bedMonthlyRentPaisa: 1800001,
  roomMonthlyRentPaisa: 3200000,
  depositPaisa: 0,
  fees: [],
  archivedAt: null,
};
const page = { ...access, data: [type], nextCursor: null };
function fixture(response: unknown, status = 200) {
  const requests: Request[] = [],
    token = vi.fn(async () => 'private-token');
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
function request(store: ReturnType<typeof fixture>) {
  const row = store.requests[0];
  if (!row) throw new Error('Missing request');
  return row;
}
it('ROOM-002 / ACC-004: root pages use canonical branch, exact limit and current authentication', async () => {
  const store = fixture(page);
  expect(await listInventoryRoomTypes(store.client, branchId.toUpperCase())).toEqual(page);
  const sent = request(store),
    url = new URL(sent.url);
  expect(url.pathname).toBe('/v1/branches/' + branchId + '/inventory/pages/room-types');
  expect(url.searchParams.get('limit')).toBe('20');
  expect(url.searchParams.has('cursor')).toBe(false);
  expect(sent.headers.get('Authorization')).toBe('Bearer private-token');
  expect(store.token).toHaveBeenCalled();
});
it('ROOM-002: exact canonical cursor is sent and rows must follow it', async () => {
  const store = fixture({ ...page, data: [{ ...type, id: second }] });
  await listInventoryRoomTypes(store.client, branchId, { cursor: first.toUpperCase(), limit: 1 });
  expect(new URL(request(store).url).searchParams.get('cursor')).toBe(first);
  expect(new URL(request(store).url).searchParams.get('limit')).toBe('1');
  await expect(
    listInventoryRoomTypes(fixture(page).client, branchId, { cursor: first }),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('ROOM-002: empty collections remain genuinely empty', async () => {
  expect(
    (await listInventoryRoomTypes(fixture({ ...page, data: [] }).client, branchId)).data,
  ).toEqual([]);
});
it('ACC-004: rooms and beds bind their exact parent even for empty pages', async () => {
  const rooms = fixture({ ...access, roomTypeId: first, data: [], nextCursor: null });
  await listInventoryRooms(rooms.client, branchId.toUpperCase(), first.toUpperCase());
  expect(new URL(request(rooms).url).pathname).toBe(
    '/v1/branches/' + branchId + '/inventory/pages/room-types/' + first + '/rooms',
  );
  const beds = fixture({ ...access, roomId: second, data: [], nextCursor: null });
  await listInventoryBeds(beds.client, branchId, second.toUpperCase());
  expect(new URL(request(beds).url).pathname).toBe(
    '/v1/branches/' + branchId + '/inventory/pages/rooms/' + second + '/seats',
  );
  await expect(
    listInventoryRooms(
      fixture({ ...access, roomTypeId: second, data: [], nextCursor: null }).client,
      branchId,
      first,
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  await expect(
    listInventoryBeds(
      fixture({ ...access, roomId: first, data: [], nextCursor: null }).client,
      branchId,
      second,
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it.each([
  { ...page, branchId: first, data: [] },
  { ...page, data: [type, type] },
  { ...page, nextCursor: second },
  { ...page, nextCursor: first },
  { ...page, data: [{ ...type, branchId: first }] },
  { ...page, data: [{ ...type, archivedAt: '2026-10-17T00:00:00Z' }] },
])('ACC-004: malformed or cross-scope payload fails before UI use', async (response) => {
  await expect(listInventoryRoomTypes(fixture(response).client, branchId)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
});
it('ROOM-002: response count cannot exceed requested limit or manufacture a short-page continuation', async () => {
  await expect(
    listInventoryRoomTypes(
      fixture({ ...page, data: [type, { ...type, id: second }] }).client,
      branchId,
      { limit: 1 },
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  expect(
    (
      await listInventoryRoomTypes(fixture({ ...page, nextCursor: first }).client, branchId, {
        limit: 1,
      })
    ).nextCursor,
  ).toBe(first);
});
it('ACC-004: invalid input never sends a request and server denials are preserved', async () => {
  const store = fixture(page);
  for (const query of [{ cursor: 'bad' }, { limit: 101 }, { limit: 0 }, { occupants: true }])
    await expect(listInventoryRoomTypes(store.client, branchId, query)).rejects.toThrow();
  await expect(listInventoryRooms(store.client, branchId, 'bad')).rejects.toThrow();
  await expect(listInventoryBeds(store.client, 'bad', first)).rejects.toThrow();
  expect(store.requests).toHaveLength(0);
  await expect(
    listInventoryRoomTypes(
      fixture(
        {
          type: 'https://example.test/problems/branch-forbidden',
          title: 'Forbidden',
          code: 'BRANCH_FORBIDDEN',
          status: 403,
          detail: 'Branch unavailable',
          traceId: 'test-trace',
        },
        403,
      ).client,
      branchId,
    ),
  ).rejects.toMatchObject({ code: 'BRANCH_FORBIDDEN' });
});

it('ACC-004 / PERF: permissions use the lightweight route and reject even empty cross-branch responses', async () => {
  const store = fixture(access);
  expect(await readInventoryAccess(store.client, branchId.toUpperCase())).toEqual(access);
  expect(new URL(request(store).url).pathname).toBe(
    '/v1/branches/' + branchId + '/inventory/pages/access',
  );
  expect(request(store).headers.get('Authorization')).toBe('Bearer private-token');
  await expect(
    readInventoryAccess(fixture({ ...access, branchId: first }).client, branchId),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
