import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import { joinWaitlist, leaveWaitlist, listBranchWaitlist, listOwnWaitlist } from './waitlist.js';
const branchId = randomUUID(),
  entryId = randomUUID(),
  roomTypeId = randomUUID(),
  key = randomUUID();
const row = {
  id: entryId,
  branchId,
  branchName: 'Actual hostel',
  roomTypeId: null,
  roomTypeName: null,
  expectedVacancyDate: null,
  joinedAt: '2026-10-24T03:00:00.000Z',
  leftAt: null,
};
function fixture(value: unknown) {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async () => Response.json(value));
  return {
    fetch,
    client: createApiClient({
      baseUrl: 'https://api.example.test',
      fetch,
      authentication: { kind: 'cookie', csrf: () => 'csrf' },
    }),
  };
}
it('WAIT-001: joining validates exact preference, carries CSRF and the original command key', async () => {
  const f = fixture(row);
  expect(await joinWaitlist(f.client, { branchId }, key)).toEqual(row);
  const request = f.fetch.mock.calls[0]?.[0];
  if (!(request instanceof Request)) throw new Error('Request absent');
  expect(request.headers.get('idempotency-key')).toBe(key);
  expect(request.headers.get('x-csrf-token')).toBe('csrf');
  expect(await request.json()).toEqual({ branchId });
});
it('WAIT-001: room-type preference is explicit and preserved', async () => {
  const result = { ...row, roomTypeId, roomTypeName: 'Two beds' };
  expect(await joinWaitlist(fixture(result).client, { branchId, roomTypeId }, key)).toEqual(result);
});
it.each([
  { ...row, branchId: randomUUID() },
  { ...row, roomTypeId, roomTypeName: 'Other preference' },
  { ...row, leftAt: row.joinedAt },
  { ...row, customerUserId: randomUUID() },
])('WAIT-001 / SEC-003: foreign, inactive or expanded join results fail closed', async (result) => {
  await expect(joinWaitlist(fixture(result).client, { branchId }, key)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
});
it('WAIT-001: leave verifies exact identity and historical departure', async () => {
  const result = { ...row, leftAt: row.joinedAt };
  expect(await leaveWaitlist(fixture(result).client, entryId, key)).toEqual(result);
});
it.each([row, { ...row, id: randomUUID(), leftAt: row.joinedAt }])(
  'WAIT-001: unacknowledged/foreign leave result is rejected',
  async (value) => {
    await expect(leaveWaitlist(fixture(value).client, entryId, key)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  },
);
it('WAIT-001: own/branch bounded pages include only their allowed fields', async () => {
  expect(await listOwnWaitlist(fixture({ data: [row], nextCursor: null }).client)).toEqual({
    data: [row],
    nextCursor: null,
  });
  const staff = { ...row, customerName: 'Customer' };
  expect(
    (await listBranchWaitlist(fixture({ data: [staff], nextCursor: null }).client, branchId)).data,
  ).toEqual([staff]);
  await expect(
    listOwnWaitlist(fixture({ data: [staff], nextCursor: null }).client),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it.each([
  { data: [row, row], nextCursor: null },
  { data: [row], nextCursor: entryId },
  { data: [], nextCursor: entryId },
])('WAIT-001: duplicate and invalid pagination responses are rejected', async (value) => {
  await expect(listOwnWaitlist(fixture(value).client)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
});
it('WAIT-001: cursor/room preference, page limit and branch correlations are checked', async () => {
  await expect(
    listOwnWaitlist(fixture({ data: [row], nextCursor: null }).client, { cursor: entryId }),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  await expect(
    listOwnWaitlist(fixture({ data: [row], nextCursor: null }).client, { roomTypeId }),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  await expect(
    listBranchWaitlist(
      fixture({ data: [{ ...row, customerName: 'Customer' }], nextCursor: null }).client,
      randomUUID(),
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  await expect(
    listOwnWaitlist(fixture({ data: [row, row], nextCursor: null }).client, { limit: 1 }),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  const f = fixture({ data: [row], nextCursor: entryId });
  expect((await listOwnWaitlist(f.client, { limit: 1 })).nextCursor).toBe(entryId);
});
it('WAIT-001: malformed commands never reach the transport', async () => {
  const f = fixture(row);
  await expect(joinWaitlist(f.client, { branchId, reserved: true }, key)).rejects.toThrow();
  await expect(leaveWaitlist(f.client, 'invalid', key)).rejects.toThrow();
  await expect(listOwnWaitlist(f.client, { limit: 101 })).rejects.toThrow();
  expect(f.fetch).not.toHaveBeenCalled();
});
