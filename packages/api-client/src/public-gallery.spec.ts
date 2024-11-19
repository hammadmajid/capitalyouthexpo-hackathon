import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import { publicGallery } from './public-gallery.js';
const branchId = randomUUID(),
  photoId = randomUUID();
function fixture(body: unknown) {
  const requests: Request[] = [],
    accessToken = vi.fn(async () => 'private-token');
  const client = createApiClient({
    baseUrl: 'https://example.test',
    authentication: { kind: 'bearer', accessToken },
    fetch: async (input, init) => {
      requests.push(input instanceof Request ? input : new Request(input, init));
      return Response.json(body);
    },
  });
  return { client, requests, accessToken };
}
it('ACC-002 / SEC-003: anonymous gallery uses bounded continuation and never loads private credentials', async () => {
  const data = {
    branchId,
    data: [{ id: photoId, altText: 'Actual exterior' }],
    nextCursor: '4:' + photoId,
  };
  const value = fixture(data);
  expect(
    await publicGallery(value.client, branchId.toUpperCase(), { limit: 1, cursor: '2:' + photoId }),
  ).toEqual(data);
  expect(value.accessToken).not.toHaveBeenCalled();
  const request = value.requests[0];
  if (!request) throw new Error('Missing request');
  expect(request.headers.has('Authorization')).toBe(false);
  const url = new URL(request.url);
  expect(url.pathname).toBe('/v1/marketplace/' + branchId + '/gallery');
  expect(url.searchParams.get('limit')).toBe('1');
  expect(url.searchParams.get('cursor')).toBe('2:' + photoId);
});
it('ACC-002: a genuine empty gallery remains empty with the default page bound', async () => {
  const value = fixture({ branchId, data: [], nextCursor: null });
  expect(await publicGallery(value.client, branchId)).toEqual({
    branchId,
    data: [],
    nextCursor: null,
  });
  const request = value.requests[0];
  if (!request) throw new Error('Missing request');
  expect(new URL(request.url).searchParams.get('limit')).toBe('20');
});
it.each([
  { branchId: randomUUID(), data: [], nextCursor: null },
  {
    branchId,
    data: [{ id: photoId, altText: 'Image', objectKey: 'private/key' }],
    nextCursor: null,
  },
  { branchId, data: [], nextCursor: '0:' + photoId },
  { branchId, data: [{ id: photoId, altText: 'Image' }], nextCursor: '0:' + randomUUID() },
])('ACC-002 / SEC-003: rejects mismatched or private gallery response %#', async (body) => {
  await expect(publicGallery(fixture(body).client, branchId)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
});
it.each([{ limit: 101 }, { cursor: 'invalid' }, { limit: 0 }])(
  'ACC-002: invalid gallery query %# never dispatches',
  async (query) => {
    const value = fixture({});
    await expect(publicGallery(value.client, branchId, query)).rejects.toThrow();
    expect(value.requests).toHaveLength(0);
  },
);
it('ACC-002: invalid branch never dispatches', async () => {
  const value = fixture({});
  await expect(publicGallery(value.client, 'invalid')).rejects.toThrow();
  expect(value.requests).toHaveLength(0);
});
