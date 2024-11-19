import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createApiClient } from './client.js';
import { readRoomTypeAmenities, saveRoomTypeAmenities } from './room-amenities.js';
const branchId = randomUUID(),
  roomTypeId = randomUUID(),
  key = randomUUID(),
  version = 'a'.repeat(64),
  wifi = { code: 'wifi', name: 'Wi-Fi', isActive: true };
const state = { branchId, roomTypeId, version, canEdit: true, amenities: [wifi] };
function fixture(response: unknown, cookie = false) {
  const requests: Request[] = [];
  const client = createApiClient({
    baseUrl: 'https://example.test',
    authentication: cookie
      ? { kind: 'cookie', csrf: () => 'csrf-proof' }
      : { kind: 'bearer', accessToken: async () => 'private-access' },
    fetch: async (input, init) => {
      requests.push(input instanceof Request ? input : new Request(input, init));
      return Response.json(response);
    },
  });
  return { client, requests };
}
it('ROOM-002 / ACC-004: private room amenities use normalized exact branch/child and protected authentication', async () => {
  const value = fixture({ ...state, canEdit: false });
  expect(
    await readRoomTypeAmenities(value.client, branchId.toUpperCase(), roomTypeId.toUpperCase()),
  ).toEqual({ ...state, canEdit: false });
  const request = value.requests[0];
  if (!request) throw new Error('Missing request');
  expect(new URL(request.url).pathname).toBe(
    '/v1/branches/' + branchId + '/room-types/' + roomTypeId + '/amenities',
  );
  expect(request.headers.get('Authorization')).toBe('Bearer private-access');
});
it('ROOM-002 / SEC-001: canonical write carries exact precondition, key, CSRF and no pricing fields', async () => {
  const value = fixture(
    { ...state, amenities: [{ code: 'ac', name: 'AC', isActive: true }, wifi] },
    true,
  );
  await saveRoomTypeAmenities(
    value.client,
    branchId,
    roomTypeId,
    version,
    { amenityCodes: ['wifi', 'ac'] },
    key,
  );
  const request = value.requests[0];
  if (!request) throw new Error('Missing request');
  expect(request.method).toBe('PUT');
  expect(request.headers.get('If-Match')).toBe('"' + version + '"');
  expect(request.headers.get('Idempotency-Key')).toBe(key);
  expect(request.headers.get('X-CSRF-Token')).toBe('csrf-proof');
  expect(await request.json()).toEqual({ amenityCodes: ['ac', 'wifi'] });
});
it('ROOM-002: explicit clearing requires an actual matched empty persisted selection', async () => {
  const value = fixture({ ...state, amenities: [] });
  expect(
    (
      await saveRoomTypeAmenities(
        value.client,
        branchId,
        roomTypeId,
        version,
        { amenityCodes: [] },
        key,
      )
    ).amenities,
  ).toEqual([]);
});
it.each([
  { ...state, branchId: randomUUID() },
  { ...state, roomTypeId: randomUUID() },
  { ...state, objectKey: 'private/key' },
])('ACC-004: rejects mismatched/private room amenity reads %#', async (body) => {
  await expect(
    readRoomTypeAmenities(fixture(body).client, branchId, roomTypeId),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it.each([
  { ...state, branchId: randomUUID() },
  { ...state, roomTypeId: randomUUID() },
  { ...state, amenities: [] },
  { ...state, canEdit: false },
])(
  'ROOM-002 / ACC-004: cannot report mutation success from mismatched persisted state %#',
  async (body) => {
    await expect(
      saveRoomTypeAmenities(
        fixture(body).client,
        branchId,
        roomTypeId,
        version,
        { amenityCodes: ['wifi'] },
        key,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  },
);
it.each([
  { branch: 'bad', room: roomTypeId, version, input: { amenityCodes: [] }, key },
  { branch: branchId, room: 'bad', version, input: { amenityCodes: [] }, key },
  { branch: branchId, room: roomTypeId, version: 'bad', input: { amenityCodes: [] }, key },
  { branch: branchId, room: roomTypeId, version, input: { amenityCodes: [] }, key: 'bad' },
  { branch: branchId, room: roomTypeId, version, input: { amenityCodes: ['wifi', 'wifi'] }, key },
  {
    branch: branchId,
    room: roomTypeId,
    version,
    input: { amenityCodes: [], depositPaisa: 0 },
    key,
  },
])('ROOM-002: invalid amenity write boundary %# never dispatches', async (input) => {
  const value = fixture(state);
  await expect(
    saveRoomTypeAmenities(
      value.client,
      input.branch,
      input.room,
      input.version,
      input.input,
      input.key,
    ),
  ).rejects.toThrow();
  expect(value.requests).toHaveLength(0);
});
