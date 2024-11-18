import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createApiClient } from './client.js';
import { readManagerInventoryGrants, saveManagerInventoryGrants } from './manager-grants.js';
const branchId = randomUUID(),
  assignmentId = randomUUID(),
  key = randomUUID();
const state = { branchId, assignmentId, permissions: ['listing_edit'] };
const mutation = { branchId, id: assignmentId, kind: 'manager_grants' };
function wire(body: unknown, status = 200) {
  const requests: Request[] = [];
  const client = createApiClient({
    baseUrl: 'https://example.test',
    authentication: { kind: 'cookie', csrf: () => 'fixture-csrf' },
    fetch: async (request, init) => {
      requests.push(request instanceof Request ? request : new Request(request, init));
      return Response.json(body, { status });
    },
  });
  function request() {
    const value = requests[0];
    if (!value) throw new Error('Missing request');
    return value;
  }
  return { client, requests, request };
}
it('ACC-004: reads exact normalized branch and assignment without write credentials', async () => {
  const value = wire(state);
  expect(
    await readManagerInventoryGrants(
      value.client,
      branchId.toUpperCase(),
      assignmentId.toUpperCase(),
    ),
  ).toEqual(state);
  expect(new URL(value.request().url).pathname).toBe(
    `/v1/branches/${branchId}/managers/${assignmentId}/inventory-permissions`,
  );
  expect(value.request().headers.has('X-CSRF-Token')).toBe(false);
});
it('ACC-004: replaces explicit grants with stable idempotency key and cookie CSRF', async () => {
  const value = wire(mutation);
  expect(
    await saveManagerInventoryGrants(
      value.client,
      branchId,
      assignmentId,
      { permissions: [] },
      key,
    ),
  ).toEqual(mutation);
  expect(value.request().method).toBe('PUT');
  expect(value.request().headers.get('Idempotency-Key')).toBe(key);
  expect(value.request().headers.get('X-CSRF-Token')).toBe('fixture-csrf');
  expect(await value.request().json()).toEqual({ permissions: [] });
});
it.each([
  { ...state, branchId: randomUUID() },
  { ...state, assignmentId: randomUUID() },
  { ...state, permissions: ['private_document_download'] },
  { ...state, permissions: ['listing_edit', 'listing_edit'] },
  { ...state, privateDocument: 'private' },
])('SEC-003: invalid or cross-scope read projections fail closed %#', async (body) => {
  await expect(
    readManagerInventoryGrants(wire(body).client, branchId, assignmentId),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it.each([
  { ...mutation, branchId: randomUUID() },
  { ...mutation, id: randomUUID() },
  { ...mutation, kind: 'seat' },
])('SEC-003: a mismatched mutation response cannot report grant save success %#', async (body) => {
  await expect(
    saveManagerInventoryGrants(wire(body).client, branchId, assignmentId, { permissions: [] }, key),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('ACC-004: unknown and duplicate permissions fail before any write', async () => {
  const value = wire(mutation);
  await expect(
    saveManagerInventoryGrants(
      value.client,
      branchId,
      assignmentId,
      { permissions: ['unknown'] },
      key,
    ),
  ).rejects.toThrow();
  await expect(
    saveManagerInventoryGrants(
      value.client,
      branchId,
      assignmentId,
      { permissions: ['listing_edit', 'listing_edit'] },
      key,
    ),
  ).rejects.toThrow();
  expect(value.requests).toHaveLength(0);
});
it('SEC-003: a scoped denial retains its typed API failure', async () => {
  const value = wire(
    {
      type: 'about:blank',
      title: 'Denied',
      detail: 'Denied',
      traceId: randomUUID(),
      code: 'BRANCH_FORBIDDEN',
      status: 403,
    },
    403,
  );
  await expect(
    readManagerInventoryGrants(value.client, branchId, assignmentId),
  ).rejects.toMatchObject({ code: 'BRANCH_FORBIDDEN' });
});
