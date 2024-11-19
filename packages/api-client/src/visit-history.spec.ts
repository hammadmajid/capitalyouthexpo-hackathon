import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import { readVisitHistory } from './visit-history.js';
const branchId = '10000000-0000-4000-8000-000000000001',
  visitId = '10000000-0000-4000-8000-000000000002';
const entry = {
  id: '10000000-0000-4000-8000-000000000003',
  action: 'request',
  status: 'requested',
  requestedStart: '2026-11-05T05:00:00Z',
  proposedStart: null,
  reason: null,
  createdAt: '2026-10-22T03:00:00Z',
};
const page = {
  branchId,
  visitId,
  branchName: 'Real hostel',
  customerName: 'Customer',
  data: [entry],
  nextCursor: null,
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
      authentication: { kind: 'bearer', accessToken: async () => 'access' },
    }),
  };
}
it.each([undefined, branchId])(
  'VISIT-001: private history binds visit and optional branch %s',
  async (branch) => {
    const f = fixture(page);
    expect(await readVisitHistory(f.client, visitId, {}, branch)).toEqual(page);
    const request = f.fetch.mock.calls[0]?.[0];
    if (!(request instanceof Request)) throw Error('Request absent');
    expect(new URL(request.url).pathname).toBe(
      branch
        ? '/v1/branches/' + branchId + '/visits/' + visitId + '/history'
        : '/v1/me/visits/' + visitId + '/history',
    );
    expect(request.headers.get('authorization')).toBe('Bearer access');
  },
);
it.each([
  { ...page, visitId: branchId },
  { ...page, branchId: visitId },
  { ...page, data: [entry, entry] },
  { ...page, nextCursor: entry.id },
  { ...page, data: [{ ...entry, actorUserId: branchId }] },
])(
  'VISIT-001 / SEC-003: foreign scope, unordered history and private producer extras fail closed',
  async (value) => {
    await expect(
      readVisitHistory(fixture(value).client, visitId, {}, branchId),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  },
);
