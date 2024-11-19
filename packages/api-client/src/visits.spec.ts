import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import {
  actOnVisit,
  listBranchVisits,
  listOwnVisits,
  readVisitSlots,
  requestVisit,
  saveVisitingHours,
} from './visits.js';
const branchId = '10000000-0000-4000-8000-000000000001',
  visitId = '10000000-0000-4000-8000-000000000002',
  key = '10000000-0000-4000-8000-000000000003';
const row = {
  id: visitId,
  branchId,
  status: 'requested',
  requestedStart: '2026-11-05T05:00:00.000Z',
  proposedStart: null,
  reason: null,
  createdAt: '2026-10-22T03:00:00.000Z',
  updatedAt: '2026-10-22T03:00:00.000Z',
};
function fixture(value: unknown, cookie = false) {
  const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => Response.json(value)),
    token = vi.fn(async () => 'access');
  const client = createApiClient({
    baseUrl: 'https://api.example.test',
    fetch,
    authentication: cookie
      ? { kind: 'cookie', csrf: () => 'csrf' }
      : { kind: 'bearer', accessToken: token },
  });
  function sent() {
    const request = fetch.mock.calls[0]?.[0];
    if (!(request instanceof Request)) throw Error('Request unavailable');
    return request;
  }
  return { client, fetch, token, sent };
}
it('VISIT-001: guest windows never load bearer credentials and bind the requested date', async () => {
  const f = fixture({ branchId, date: '2026-11-05', windows: [] });
  await readVisitSlots(f.client, 'real-hostel', '2026-11-05');
  expect(new URL(f.sent().url).pathname).toBe('/v1/public/hostels/real-hostel/visit-slots');
  expect(f.token).not.toHaveBeenCalled();
  expect(f.sent().headers.has('Authorization')).toBe(false);
});
it.each([false, true])(
  'VISIT-001: request preserves actor transport, exact body and command key (cookie %s)',
  async (cookie) => {
    const f = fixture(row, cookie),
      input = { branchId, requestedStart: row.requestedStart };
    expect(await requestVisit(f.client, input, key)).toEqual(row);
    expect(await f.sent().json()).toEqual(input);
    expect(f.sent().headers.get('idempotency-key')).toBe(key);
    expect(f.sent().headers.get(cookie ? 'x-csrf-token' : 'authorization')).toBe(
      cookie ? 'csrf' : 'Bearer access',
    );
  },
);
it('VISIT-001 / ACC-002: staff and own list reads use bounded, separate paths', async () => {
  const staff = fixture({
    data: [{ ...row, branchName: 'Hostel', customerName: 'Customer' }],
    nextCursor: null,
  });
  await listBranchVisits(staff.client, branchId);
  expect(new URL(staff.sent().url).pathname).toBe('/v1/branches/' + branchId + '/visits');
  const own = fixture({
    data: [{ ...row, branchName: 'Hostel', customerName: 'Customer' }],
    nextCursor: null,
  });
  await listOwnVisits(own.client);
  expect(new URL(own.sent().url).pathname).toBe('/v1/me/visits');
  expect(new URL(own.sent().url).searchParams.get('limit')).toBe('20');
});
it('VISIT-001 / SEC-003: foreign branch, duplicate rows or false continuation cannot populate client cache', async () => {
  await expect(
    listBranchVisits(
      fixture({
        data: [{ ...row, branchId: key, branchName: 'Hostel', customerName: 'Customer' }],
        nextCursor: null,
      }).client,
      branchId,
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  await expect(
    listOwnVisits(
      fixture({
        data: [row, row].map((value) => ({
          ...value,
          branchName: 'Hostel',
          customerName: 'Customer',
        })),
        nextCursor: null,
      }).client,
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  await expect(
    listOwnVisits(
      fixture({
        data: [{ ...row, branchName: 'Hostel', customerName: 'Customer' }],
        nextCursor: key,
      }).client,
      { limit: 1 },
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('VISIT-001: actions bind exact visit, current proposal and reviewed update marker', async () => {
  const proposedStart = '2026-11-05T06:00:00Z',
    f = fixture({ ...row, status: 'rescheduled', proposedStart: '2026-11-05T06:00:00.000Z' });
  const input = {
    expectedUpdatedAt: row.updatedAt,
    command: { action: 'reschedule', proposedStart },
  };
  await actOnVisit(f.client, visitId, input, key, branchId);
  expect(await f.sent().json()).toEqual(input);
  expect(new URL(f.sent().url).pathname).toBe(
    '/v1/branches/' + branchId + '/visits/' + visitId + '/actions',
  );
  await expect(
    actOnVisit(
      fixture({ ...row, id: key, status: 'cancelled' }).client,
      visitId,
      { expectedUpdatedAt: row.updatedAt, command: { action: 'cancel' } },
      key,
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('VISIT-001: hours saves carry the original version and reject mismatched results', async () => {
  const f = fixture({ branchId, version: 'b'.repeat(64), windows: [] });
  await saveVisitingHours(
    f.client,
    branchId,
    { expectedVersion: 'a'.repeat(64), windows: [] },
    key,
  );
  expect(await f.sent().json()).toEqual({ expectedVersion: 'a'.repeat(64), windows: [] });
  await expect(
    saveVisitingHours(
      fixture({ branchId: key, version: 'b'.repeat(64), windows: [] }).client,
      branchId,
      { expectedVersion: 'a'.repeat(64), windows: [] },
      key,
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
