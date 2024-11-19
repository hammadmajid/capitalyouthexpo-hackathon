import { expect, it } from 'vitest';
import { createApiClient } from './client.js';
import * as sdk from './index.js';
const branch = '10000000-0000-4000-8000-000000000001';
const buildingId = '20000000-0000-4000-8000-000000000001';
const floorId = '30000000-0000-4000-8000-000000000001';
const roomId = '40000000-0000-4000-8000-000000000001';
const key = '50000000-0000-4000-8000-000000000001';
const building = {
  id: buildingId,
  branchId: branch,
  name: 'Main',
  sortOrder: 0,
  version: 1,
  archivedAt: null,
};
const floor = {
  id: floorId,
  branchId: branch,
  buildingId,
  label: 'Ground',
  levelNumber: 0,
  version: 1,
  archivedAt: null,
};
const location = {
  branchId: branch,
  roomId,
  roomLabel: '101',
  version: 2,
  canEdit: true,
  archivedAt: null,
  floor: { id: floorId, label: 'Ground', buildingId, buildingName: 'Main' },
};
function fixture(body: unknown) {
  const requests: Request[] = [];
  const client = createApiClient({
    baseUrl: 'https://example.test',
    authentication: { kind: 'cookie', csrf: () => 'synthetic-csrf' },
    fetch: async (input, init) => {
      requests.push(input instanceof Request ? input : new Request(input, init));
      return Response.json(body);
    },
  });
  return { client, requests };
}
it('PROP / RPT-001 / AUD-010: SDK exposes the authorized property prerequisite', () => {
  for (const name of [
    'readPropertyBuildings',
    'readPropertyFloors',
    'readPropertyRoomLocation',
    'createPropertyBuilding',
    'createPropertyFloor',
    // eslint-disable-next-line no-secrets/no-secrets -- Public SDK export name, not a credential.
    'archivePropertyBuilding',
    'archivePropertyFloor',
    'savePropertyRoomLocation',
  ])
    expect(Reflect.get(sdk, name)).toBeTypeOf('function');
});
it('PROP / SEC-003 / AUD-010: real named page requests bind exact normalized branch and selected parent', async () => {
  const f = fixture({ branchId: branch, canEdit: false, data: [building], nextCursor: null });
  expect(
    await sdk.readPropertyBuildings(f.client, branch.toUpperCase(), { limit: 1, view: 'all' }),
  ).toMatchObject({ data: [building] });
  const request = f.requests[0];
  if (!request) throw new Error('Missing request');
  expect(new URL(request.url).pathname).toBe(`/v1/branches/${branch}/property/buildings`);
  expect(new URL(request.url).searchParams.get('limit')).toBe('1');
  const floors = fixture({
    branchId: branch,
    buildingId,
    canEdit: false,
    data: [floor],
    nextCursor: null,
  });
  expect(await sdk.readPropertyFloors(floors.client, branch, buildingId, {})).toMatchObject({
    data: [floor],
  });
  expect(new URL(floors.requests[0]?.url ?? '').searchParams.get('buildingId')).toBe(buildingId);
});
it.each([
  { branchId: roomId, canEdit: false, data: [building], nextCursor: null },
  { branchId: branch, canEdit: false, data: [{ ...building, branchId: roomId }], nextCursor: null },
  { branchId: branch, canEdit: false, data: [building], nextCursor: roomId },
  { branchId: branch, canEdit: false, data: [building, building], nextCursor: null },
])(
  'SEC-003 / AUD-010: malformed scope or continuation never reaches the selector (%#)',
  async (response) => {
    await expect(
      sdk.readPropertyBuildings(fixture(response).client, branch, { limit: 1 }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  },
);
it('ACC-004 / AUD-010: canonical creation carries exact key/CSRF and validates persisted fields', async () => {
  const f = fixture(building);
  expect(await sdk.createPropertyBuilding(f.client, branch, { name: ' Main ' }, key)).toEqual(
    building,
  );
  const request = f.requests[0];
  if (!request) throw new Error('Missing request');
  expect(request.method).toBe('POST');
  expect(request.headers.get('Idempotency-Key')).toBe(key);
  expect(request.headers.get('X-CSRF-Token')).toBe('synthetic-csrf');
  expect(await request.json()).toEqual({ name: 'Main', sortOrder: 0 });
  await expect(
    sdk.createPropertyBuilding(
      fixture({ ...building, name: 'Wrong' }).client,
      branch,
      { name: 'Main' },
      key,
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('PROP / ACC-004 / AUD-010: floor, archive and room corrections retain exact versions and targets', async () => {
  expect(
    await sdk.createPropertyFloor(
      fixture(floor).client,
      branch,
      { buildingId, label: 'Ground', levelNumber: 0 },
      key,
    ),
  ).toEqual(floor);
  const archived = new Date('2026-06-26T07:00:00Z').toISOString();
  expect(
    await sdk.archivePropertyBuilding(
      fixture({ ...building, version: 2, archivedAt: archived }).client,
      branch,
      buildingId,
      { expectedVersion: 1, reason: 'Archive metadata' },
      key,
    ),
  ).toMatchObject({ version: 2 });
  expect(
    await sdk.archivePropertyFloor(
      fixture({ ...floor, version: 2, archivedAt: archived }).client,
      branch,
      floorId,
      { expectedVersion: 1, reason: 'Archive metadata' },
      key,
    ),
  ).toMatchObject({ version: 2 });
  expect(await sdk.readPropertyRoomLocation(fixture(location).client, branch, roomId)).toEqual(
    location,
  );
  const f = fixture(location);
  expect(
    await sdk.savePropertyRoomLocation(
      f.client,
      branch,
      roomId,
      { expectedVersion: 1, floorId, reason: 'Physical location' },
      key,
    ),
  ).toEqual(location);
  expect(f.requests[0]?.method).toBe('PUT');
  await expect(
    sdk.savePropertyRoomLocation(
      fixture({ ...location, version: 1 }).client,
      branch,
      roomId,
      { expectedVersion: 1, floorId, reason: 'Physical location' },
      key,
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it.each([
  { branchId: branch, buildingId: roomId, canEdit: false, data: [floor], nextCursor: null },
  {
    branchId: branch,
    buildingId,
    canEdit: false,
    data: [{ ...floor, buildingId: roomId }],
    nextCursor: null,
  },
  {
    branchId: branch,
    buildingId,
    canEdit: false,
    data: [{ ...floor, branchId: roomId }],
    nextCursor: null,
  },
])(
  'SEC-003 / AUD-010: floor pages never substitute another parent or branch (%#)',
  async (response) => {
    await expect(
      sdk.readPropertyFloors(fixture(response).client, branch, buildingId),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  },
);
it('SEC-003 / ACC-004 / AUD-010: stale or mismatched mutation responses do not display success', async () => {
  await expect(
    sdk.readPropertyRoomLocation(fixture({ ...location, roomId: floorId }).client, branch, roomId),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  await expect(
    sdk.createPropertyFloor(
      fixture({ ...floor, buildingId: roomId }).client,
      branch,
      { buildingId, label: 'Ground', levelNumber: 0 },
      key,
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  await expect(
    sdk.archivePropertyBuilding(
      fixture({ ...building, version: 2 }).client,
      branch,
      buildingId,
      { expectedVersion: 1, reason: 'Archive' },
      key,
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  await expect(
    sdk.archivePropertyFloor(
      fixture({ ...floor, version: 2, archivedAt: new Date().toISOString(), id: roomId }).client,
      branch,
      floorId,
      { expectedVersion: 1, reason: 'Archive' },
      key,
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  await expect(
    sdk.savePropertyRoomLocation(
      fixture({ ...location, floor: null }).client,
      branch,
      roomId,
      { expectedVersion: 1, floorId, reason: 'Physical location' },
      key,
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('PROP / AUD-010: unknown legacy location and real empty pages remain explicit', async () => {
  expect(
    await sdk.savePropertyRoomLocation(
      fixture({ ...location, floor: null }).client,
      branch,
      roomId,
      { expectedVersion: 1, floorId: null, reason: 'Remove incorrect metadata' },
      key,
    ),
  ).toMatchObject({ floor: null });
  expect(
    await sdk.readPropertyBuildings(
      fixture({ branchId: branch, canEdit: false, data: [], nextCursor: null }).client,
      branch,
    ),
  ).toMatchObject({ data: [] });
  const f = fixture(building);
  await expect(sdk.readPropertyBuildings(f.client, branch, { limit: 101 })).rejects.toThrow();
  await expect(
    sdk.readPropertyFloors(f.client, branch, buildingId, { buildingId: roomId }),
  ).rejects.toThrow();
  expect(f.requests).toEqual([]);
});
