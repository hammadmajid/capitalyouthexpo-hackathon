import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import {
  readStaffStays,
  readCustomerStays,
  readStaffStay,
  readCustomerStay,
} from './stay-reads.js';
const id = '10000000-0000-4000-8000-000000000001',
  other = '10000000-0000-4000-8000-000000000002';
const summary = {
  id,
  branchId: id,
  residentId: id,
  displayName: 'Resident',
  source: 'manual',
  state: 'active',
  version: 1,
  moveInDate: '2028-02-01',
  expectedLeaveDate: '2028-03-01',
  checkedInAt: '2028-02-01T06:00:00.000Z',
  closedAt: null,
  currentAssignment: {
    id,
    roomTypeId: id,
    roomId: id,
    bedId: id,
    startedAt: '2028-02-01T06:00:00.000Z',
  },
};
const detail = { ...summary, bookingId: null, contact: { phone: null, email: null } };
function fixture(data: unknown, status = 200) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
    new Response(JSON.stringify(data), {
      status,
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
it.each(['staffPage', 'customerPage', 'staffDetail', 'customerDetail'] as const)(
  'RES-001/002: %s uses typed private GET routes and existing authentication',
  async (kind) => {
    const value = fixture(kind.endsWith('Page') ? { data: [summary], nextCursor: null } : detail);
    if (kind === 'staffPage') await readStaffStays(value.client, id.toUpperCase());
    else if (kind === 'customerPage') await readCustomerStays(value.client);
    else if (kind === 'staffDetail') await readStaffStay(value.client, id, id);
    else await readCustomerStay(value.client, id);
    const request = value.fetch.mock.calls[0]?.[0] as Request;
    expect(request.method).toBe('GET');
    expect(request.headers.get('authorization')).toBe('Bearer private-access');
    expect(request.url).toContain(
      kind.startsWith('staff') ? '/branches/' + id + '/stays' : '/me/stays',
    );
  },
);
it('RES-002: all bounded staff filters are sent without contact or account overrides', async () => {
  const value = fixture({ data: [summary], nextCursor: null });
  await readStaffStays(value.client, id, {
    limit: '1',
    state: 'active',
    q: 'Name',
    roomId: id,
    bedId: id,
    moveInFrom: '2028-01-01',
    moveInTo: '2028-03-01',
    expectedLeaveFrom: '2028-02-01',
    expectedLeaveTo: '2028-04-01',
  });
  const request = value.fetch.mock.calls[0]?.[0] as Request,
    url = new URL(request.url);
  expect(url.searchParams.get('limit')).toBe('1');
  expect(url.searchParams.get('q')).toBe('Name');
  expect(url.searchParams.get('expectedLeaveTo')).toBe('2028-04-01');
});
it.each([
  { branchId: other },
  { state: 'completed' },
  { currentAssignment: null },
  { currentAssignment: { ...summary.currentAssignment, bedId: other } },
  { moveInDate: '2027-12-31' },
  { moveInDate: '2028-04-01' },
  { expectedLeaveDate: null },
  { expectedLeaveDate: '2028-01-01' },
  { expectedLeaveDate: '2028-05-01' },
])('ACC-004: mismatched scoped/filter result %j is rejected', async (patch) => {
  const value = fixture({ data: [{ ...summary, ...patch }], nextCursor: null });
  await expect(
    readStaffStays(value.client, id, {
      state: 'active',
      roomId: id,
      bedId: id,
      moveInFrom: '2028-01-01',
      moveInTo: '2028-03-01',
      expectedLeaveFrom: '2028-02-01',
      expectedLeaveTo: '2028-04-01',
    }),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('RES-001: Customer continuation rejects repeated rows and over-limit results', async () => {
  const value = fixture({ data: [summary], nextCursor: null });
  await expect(readCustomerStays(value.client, { cursor: id })).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
  const overflow = fixture({ data: [summary, { ...summary, id: other }], nextCursor: null });
  await expect(readStaffStays(overflow.client, id, { limit: 1 })).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
});
it('ACC-004: detail cannot silently switch branch or Stay', async () => {
  for (const patch of [{ id: other }, { branchId: other }]) {
    await expect(
      readStaffStay(fixture({ ...detail, ...patch }).client, id, id),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  }
  await expect(
    readCustomerStay(fixture({ ...detail, id: other }).client, id),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('SEC-003: direct invalid query/identity boundaries reject before network', async () => {
  const value = fixture({ data: [], nextCursor: null });
  await expect(readStaffStays(value.client, 'invalid')).rejects.toThrow();
  await expect(readCustomerStays(value.client, { userId: other })).rejects.toThrow();
  expect(value.fetch).not.toHaveBeenCalled();
});
it('SEC-003: unexpected private response fields and inaccessible resources are rejected', async () => {
  await expect(
    readCustomerStay(fixture({ ...detail, cnic: 'private' }).client, id),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  await expect(readStaffStays(fixture({ error: 'denied' }, 403).client, id)).rejects.toThrow();
});

it('RES-002: short page cannot claim a continuation beyond the requested page size', async () => {
  const value = fixture({ data: [summary], nextCursor: id });
  await expect(readStaffStays(value.client, id, { limit: 20 })).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
});
