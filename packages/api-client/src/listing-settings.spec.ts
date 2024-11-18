import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createApiClient } from './client.js';
import {
  listApprovedAmenities,
  readListingSettings,
  saveListingSettings,
} from './listing-settings.js';
const branchId = randomUUID(),
  key = randomUUID(),
  version = 'a'.repeat(64);
const input = {
  description: null,
  nearbyLandmark: null,
  publicPhone: null,
  publicEmail: null,
  showPublicContact: false,
  amenityCodes: [],
};
const response = {
  description: null,
  nearbyLandmark: null,
  publicPhone: null,
  publicEmail: null,
  showPublicContact: false,
  branchId,
  version,
  canEdit: true,
  amenities: [],
};
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
it('TRUST-006: reads the exact normalized branch with no mutation credentials', async () => {
  const value = wire(response);
  expect(await readListingSettings(value.client, branchId.toUpperCase())).toEqual(response);
  expect(new URL(value.request().url).pathname).toBe(`/v1/branches/${branchId}/listing`);
  expect(value.request().headers.has('If-Match')).toBe(false);
  expect(value.request().headers.has('X-CSRF-Token')).toBe(false);
});
it('TRUST-006: saves explicit nullable fields using quoted version, stable key and CSRF', async () => {
  const value = wire(response);
  expect(await saveListingSettings(value.client, branchId, version, input, key)).toEqual(response);
  expect(value.request().method).toBe('PUT');
  expect(value.request().headers.get('If-Match')).toBe('"' + version + '"');
  expect(value.request().headers.get('Idempotency-Key')).toBe(key);
  expect(value.request().headers.get('X-CSRF-Token')).toBe('fixture-csrf');
  expect(await value.request().json()).toEqual(input);
});
it.each([
  { ...response, branchId: randomUUID() },
  { ...response, resident: 'private' },
  { ...response, version: 'invalid' },
])('SEC-003: rejects another branch or malformed/private response', async (body) => {
  await expect(readListingSettings(wire(body).client, branchId)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
  await expect(
    saveListingSettings(wire(body).client, branchId, version, input, key),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it.each(['bad', '"' + version + '"', version.toUpperCase()])(
  'TRUST-006: rejects invalid version before I/O',
  async (invalid) => {
    const value = wire(response);
    await expect(
      saveListingSettings(value.client, branchId, invalid, input, key),
    ).rejects.toThrow();
    expect(value.requests).toHaveLength(0);
  },
);
it('TRUST-006: rejects identity fields and malformed identifiers before I/O', async () => {
  const value = wire(response);
  await expect(
    saveListingSettings(value.client, branchId, version, { ...input, name: 'Major edit' }, key),
  ).rejects.toThrow();
  await expect(
    saveListingSettings(value.client, branchId, version, input, 'bad'),
  ).rejects.toThrow();
  await expect(readListingSettings(value.client, 'bad')).rejects.toThrow();
  expect(value.requests).toHaveLength(0);
});
it('TRUST-006: preserves typed stale-version errors', async () => {
  const value = wire(
    {
      type: 'about:blank',
      title: 'Precondition failed',
      status: 412,
      code: 'PRECONDITION_FAILED',
      detail: 'Listing changed',
      traceId: randomUUID(),
    },
    412,
  );
  await expect(
    saveListingSettings(value.client, branchId, version, input, key),
  ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
});
it('TRUST-006: pages approved amenities using actual cursor and technical default limit', async () => {
  const page = { data: [{ code: 'wifi', name: 'Wi-Fi' }], nextCursor: 'wifi' },
    value = wire(page);
  expect(await listApprovedAmenities(value.client, { cursor: 'parking', limit: 10 })).toEqual(page);
  expect(new URL(value.request().url).searchParams.get('cursor')).toBe('parking');
  expect(new URL(value.request().url).searchParams.get('limit')).toBe('10');
  const initial = wire({ data: [], nextCursor: null });
  await listApprovedAmenities(initial.client);
  expect(new URL(initial.request().url).searchParams.get('limit')).toBe('20');
});
it('TRUST-006: rejects invalid catalog query before I/O and private catalog additions', async () => {
  const value = wire({ data: [], nextCursor: null });
  await expect(listApprovedAmenities(value.client, { limit: 101 })).rejects.toThrow();
  expect(value.requests).toHaveLength(0);
  await expect(
    listApprovedAmenities(
      wire({ data: [{ code: 'wifi', name: 'Wi-Fi', actorId: branchId }], nextCursor: null }).client,
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});

it('ACC-002: public approved catalog does not request or disclose a bearer session', async () => {
  let tokenReads = 0;
  const requests: Request[] = [];
  const client = createApiClient({
    baseUrl: 'https://example.test',
    authentication: {
      kind: 'bearer',
      accessToken: async () => {
        tokenReads += 1;
        return 'private-token';
      },
    },
    fetch: async (input, init) => {
      requests.push(input instanceof Request ? input : new Request(input, init));
      return Response.json({ data: [], nextCursor: null });
    },
  });
  expect(await listApprovedAmenities(client)).toEqual({ data: [], nextCursor: null });
  expect(tokenReads).toBe(0);
  expect(requests[0]?.headers.has('Authorization')).toBe(false);
  expect(requests[0]?.credentials).toBe('omit');
});
