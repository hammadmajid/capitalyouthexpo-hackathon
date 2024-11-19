import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import {
  readOwnStayRecord,
  readResidentDirectory,
  readResidentProfile,
  readStaffStayRecord,
  updateResidentContact,
} from './residents.js';
import { readBedOccupancy } from './occupancy.js';
const branchId = '10000000-0000-4000-8000-000000000001',
  residentId = '10000000-0000-4000-8000-000000000002',
  stayId = '10000000-0000-4000-8000-000000000003',
  bedId = '10000000-0000-4000-8000-000000000004';
function fixture(data: unknown) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  return {
    fetch,
    client: createApiClient({
      baseUrl: 'https://api.example.test',
      authentication: { kind: 'bearer', accessToken: async () => 'private-access' },
      fetch,
    }),
  };
}
const row = { id: residentId, displayName: 'R', linked: false, status: 'none', currentStay: null };
const profile = {
  ...row,
  branchId,
  contact: { phone: null, email: null },
  archived: false,
  createdAt: '2026-10-25T10:00:00.000Z',
  stays: [],
  staysTruncated: false,
};
const record = {
  stayId,
  branch: { id: branchId, name: 'Branch A' },
  agreements: [],
  assignments: [],
  history: [],
  truncated: false,
};
const bed = {
  branchId,
  on: '2026-10-26',
  room: { id: bedId, label: '1', roomTypeId: bedId, roomTypeName: 'S', status: 'active' },
  bed: { id: bedId, label: 'A', ordinal: 1, status: 'active', state: 'available', occupant: null },
  claims: [],
};
it('RES-004: directory sends bounded filters and rejects duplicate residents', async () => {
  const value = fixture({ data: [row], nextCursor: null });
  await readResidentDirectory(value.client, branchId, {
    q: 'R',
    status: 'none',
    linked: 'false',
    cursor: stayId,
  });
  expect((value.fetch.mock.calls[0]?.[0] as Request).url).toBe(
    `https://api.example.test/v1/branches/${branchId}/residents?limit=20&sort=name&q=R&status=none&linked=false&cursor=${stayId}`,
  );
  await expect(
    readResidentDirectory(fixture({ data: [row, row], nextCursor: null }).client, branchId),
  ).rejects.toThrow();
  await expect(
    readResidentDirectory(
      fixture({ data: [row, { ...row, id: stayId }], nextCursor: null }).client,
      branchId,
      {
        limit: 1,
      },
    ),
  ).rejects.toThrow();
});
it('RES-004 / STAY-002: profile and records must match the requested scope', async () => {
  await expect(readResidentProfile(fixture(profile).client, branchId, residentId)).resolves.toEqual(
    profile,
  );
  await expect(
    readResidentProfile(fixture({ ...profile, branchId: stayId }).client, branchId, residentId),
  ).rejects.toThrow();
  await expect(readStaffStayRecord(fixture(record).client, branchId, stayId)).resolves.toEqual(
    record,
  );
  await expect(readStaffStayRecord(fixture(record).client, stayId, stayId)).rejects.toThrow();
  const own = fixture(record);
  await expect(readOwnStayRecord(own.client, stayId)).resolves.toEqual(record);
  expect((own.fetch.mock.calls[0]?.[0] as Request).url).toBe(
    `https://api.example.test/v1/me/stays/${stayId}/record`,
  );
  await expect(readOwnStayRecord(fixture(record).client, residentId)).rejects.toThrow();
});
it('BED-002: bed detail must describe the requested bed and date', async () => {
  const value = fixture(bed);
  await expect(
    readBedOccupancy(value.client, branchId, bedId, { on: '2026-10-26' }),
  ).resolves.toEqual(bed);
  expect((value.fetch.mock.calls[0]?.[0] as Request).url).toBe(
    `https://api.example.test/v1/branches/${branchId}/occupancy/beds/${bedId}?on=2026-10-26`,
  );
  await expect(readBedOccupancy(fixture(bed).client, branchId, stayId)).rejects.toThrow();
  await expect(
    readBedOccupancy(fixture(bed).client, branchId, bedId, { on: '2026-10-27' }),
  ).rejects.toThrow();
});

it('STAY-002: validates agreement continuation and sends the exact version boundary', async () => {
  await expect(
    readOwnStayRecord(fixture({ ...record, nextAgreementBeforeVersion: 3 }).client, stayId),
  ).rejects.toThrow();
  const value = fixture(record);
  await readOwnStayRecord(value.client, stayId, { beforeAgreementVersion: 3 });
  expect((value.fetch.mock.calls[0]?.[0] as Request).url).toContain('beforeAgreementVersion=3');
  await expect(
    readOwnStayRecord(value.client, stayId, { beforeAgreementVersion: 0 }),
  ).rejects.toThrow();
});
it('RES-006: contact update sends the exact body and rejects a response for another resident', async () => {
  const body = { displayName: 'Ali', phone: '+923001234567', email: null };
  const ok = fixture({ id: residentId, branchId, ...body });
  await expect(updateResidentContact(ok.client, branchId, residentId, body)).resolves.toEqual({
    id: residentId,
    branchId,
    ...body,
  });
  const request = ok.fetch.mock.calls[0]?.[0] as Request;
  expect(request.method).toBe('PUT');
  expect(new URL(request.url).pathname).toBe(
    `/v1/branches/${branchId}/residents/${residentId}/contact`,
  );
  expect(await request.json()).toEqual(body);
  const wrong = fixture({ id: stayId, branchId, ...body });
  await expect(updateResidentContact(wrong.client, branchId, residentId, body)).rejects.toThrow();
  await expect(
    updateResidentContact(ok.client, branchId, residentId, { ...body, phone: '0300' }),
  ).rejects.toThrow();
});
