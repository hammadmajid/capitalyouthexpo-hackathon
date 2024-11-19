import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import { readVisitInterest, recordVisitInterest } from './visit-interest.js';
const branchId = '10000000-0000-4000-8000-000000000001',
  visitId = '10000000-0000-4000-8000-000000000002';
const before = '2026-10-22T03:00:00.000Z';
const state = {
  visitId,
  branchId,
  expectedUpdatedAt: '2026-10-22T03:00:00.001Z',
  promptedAt: null,
  stillInterested: false,
  respondedAt: before,
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
it.each([undefined, branchId])(
  'VISIT-001: interest reads bind exact private scope %s',
  async (branch) => {
    const f = fixture(state);
    expect(await readVisitInterest(f.client, visitId, branch)).toEqual(state);
    const request = f.fetch.mock.calls[0]?.[0];
    if (!(request instanceof Request)) throw Error('Request absent');
    expect(new URL(request.url).pathname).toContain('/visits/' + visitId + '/interest');
  },
);
it('VISIT-001 / SEC-003: explicit negative interest remains false, with cookie CSRF and retained command key', async () => {
  const f = fixture(state),
    body = { expectedUpdatedAt: before, stillInterested: false };
  expect(await recordVisitInterest(f.client, visitId, body, branchId)).toEqual(state);
  const request = f.fetch.mock.calls[0]?.[0];
  if (!(request instanceof Request)) throw Error('Request absent');
  expect(request.headers.get('idempotency-key')).toBe(branchId);
  expect(request.headers.get('x-csrf-token')).toBe('csrf');
  expect(await request.json()).toEqual(body);
});
it.each([
  { ...state, visitId: branchId },
  { ...state, stillInterested: true },
  { ...state, respondedAt: null },
  { ...state, expectedUpdatedAt: before },
])('VISIT-001: mismatched or unadvanced interest responses fail closed', async (value) => {
  await expect(
    recordVisitInterest(
      fixture(value).client,
      visitId,
      { expectedUpdatedAt: before, stillInterested: false },
      branchId,
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('VISIT-001 / ACC-002: a foreign branch cannot populate interest state', async () => {
  await expect(
    readVisitInterest(fixture({ ...state, branchId: visitId }).client, visitId, branchId),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
