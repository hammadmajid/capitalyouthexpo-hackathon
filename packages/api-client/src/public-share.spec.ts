import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import { publicHostelShareUrl, readPublicHostelSummary } from './public-share.js';
const branchId = '10000000-0000-4000-8000-000000000001',
  roomId = '10000000-0000-4000-8000-000000000004';
const listing = {
  branchId,
  brandName: 'Public hostel',
  name: 'Public branch',
  slug: 'public-branch',
  category: 'boys',
  city: 'Islamabad',
  area: null,
  latitude: 33.7,
  longitude: 73.1,
  priceFromPaisa: 1800001,
  verified: true,
  availableBeds: null,
  availableWholeRooms: null,
  amenities: [],
  media: [],
  distanceMeters: null,
  description: null,
  address: 'Public address',
  landmark: null,
  publicPhone: null,
  publicEmail: null,
};
function fixture(override: Record<string, unknown> = {}, unavailable = false) {
  const requests: Request[] = [],
    accessToken = vi.fn(async () => 'PRIVATE');
  const client = createApiClient({
    baseUrl: 'https://api.example.test',
    authentication: { kind: 'bearer', accessToken },
    fetch: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      requests.push(request);
      const url = new URL(request.url);
      if (url.pathname.endsWith('/room-types') || url.pathname.endsWith('/rules'))
        return Response.json({ branchId, data: [], nextCursor: null });
      if (unavailable)
        return Response.json(
          {
            type: 'about:blank',
            title: 'Unavailable',
            detail: 'Unavailable',
            status: 404,
            code: 'NOT_FOUND',
            traceId: 'fixture',
          },
          { status: 404 },
        );
      return Response.json({ ...listing, ...override });
    },
  });
  return { client, requests, accessToken };
}
it('SEC-003 / p.14: canonical share URL contains only a public branch identity', () => {
  expect(publicHostelShareUrl('https://web.example.test', branchId.toUpperCase())).toBe(
    'https://web.example.test/share/' + branchId,
  );
  expect(publicHostelShareUrl('http://localhost:3000', branchId)).toContain('/share/');
});
it.each([
  'https://web.example.test/profile',
  'https://user:private@web.example.test',
  'https://web.example.test?customer=private',
  'https://web.example.test#payment',
  'ftp://web.example.test',
  'invalid',
])('SEC-003: reject origin routing, credentials or personal query input %s', (origin) => {
  expect(() => publicHostelShareUrl(origin, branchId)).toThrow();
});
it('SEC-003 / p.14: public summary uses independent bounded public transports without requesting a session', async () => {
  const value = fixture();
  const summary = await readPublicHostelSummary(value.client, branchId, {
    roomCursor: roomId,
    ruleCursor: '0:' + branchId,
  });
  expect(summary.listing).toEqual(listing);
  expect(value.requests).toHaveLength(3);
  expect(value.accessToken).not.toHaveBeenCalled();
  expect(
    value.requests.every(
      (request) =>
        request.credentials === 'omit' &&
        !request.headers.has('authorization') &&
        !request.headers.has('cookie'),
    ),
  ).toBe(true);
  const urls = value.requests.map((request) => new URL(request.url));
  expect(urls.find((url) => url.pathname.endsWith('/room-types'))?.searchParams.get('cursor')).toBe(
    roomId,
  );
  expect(
    urls
      .filter((url) => url.pathname.endsWith('/rules') || url.pathname.endsWith('/room-types'))
      .every((url) => url.searchParams.get('limit') === '20'),
  ).toBe(true);
  expect((await readPublicHostelSummary(value.client, branchId)).rules.data).toEqual([]);
});
it('SEC-003: malformed branch/personal query input never starts a public request', async () => {
  const value = fixture();
  await expect(readPublicHostelSummary(value.client, 'foreign/private')).rejects.toThrow();
  await expect(
    readPublicHostelSummary(value.client, branchId, { customerId: branchId }),
  ).rejects.toThrow();
  expect(value.requests).toHaveLength(0);
});
it('SEC-003: unavailable listings and private-field injection never yield a partial summary', async () => {
  const hidden = fixture({}, true);
  await expect(readPublicHostelSummary(hidden.client, branchId)).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
  const injected = fixture({ customerName: 'PRIVATE', paymentStatus: 'paid' });
  await expect(readPublicHostelSummary(injected.client, branchId)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
});
