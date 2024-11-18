import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import { comparisonInputSchema, readHostelComparison } from './hostel-comparison.js';
const a = '10000000-0000-4000-8000-000000000001',
  b = '10000000-0000-4000-8000-000000000002',
  place = '10000000-0000-4000-8000-000000000003',
  foreign = '10000000-0000-4000-8000-000000000004';
function listing(branchId: string) {
  return {
    branchId,
    brandName: 'Hostel',
    name: branchId === a ? 'North hostel' : 'South hostel',
    slug: branchId,
    category: 'boys',
    city: 'Islamabad',
    area: null,
    latitude: 33,
    longitude: 73,
    priceFromPaisa: 1800001,
    verified: true,
    availableBeds: null,
    availableWholeRooms: null,
    amenities: [],
    media: [],
    distanceMeters: null,
  };
}
function fixture(
  patch: { ids?: string[]; nextCursor?: string; typeBranch?: string; destination?: boolean } = {},
) {
  const requests: Request[] = [],
    token = vi.fn(async () => 'PRIVATE');
  const client = createApiClient({
    baseUrl: 'https://example.test',
    authentication: { kind: 'bearer', accessToken: token },
    fetch: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      requests.push(request);
      const url = new URL(request.url);
      if (url.pathname.endsWith('/institutions'))
        return Response.json({
          data:
            patch.destination === false
              ? []
              : [
                  {
                    id: place,
                    type: 'university',
                    name: 'University',
                    shortName: null,
                    cityId: foreign,
                    latitude: 34,
                    longitude: 73,
                    hostelCount: 2,
                  },
                ],
          nextCursor: null,
        });
      if (url.pathname.endsWith('/room-types'))
        return Response.json({
          branchId: patch.typeBranch ?? url.pathname.split('/')[3],
          data: [],
          nextCursor: null,
        });
      return Response.json({
        data: (patch.ids ?? [b, a]).map(listing),
        nextCursor: patch.nextCursor ?? null,
      });
    },
  });
  return { client, requests, token };
}
it('p.14 / ACC-002: comparison keeps selected order, exact paisa, public scope and common dates', async () => {
  const value = fixture(),
    range = { moveInDate: '2026-11-01', moveOutDate: '2026-12-01' };
  const result = await readHostelComparison(value.client, {
    ids: [a, b],
    range,
    destinationId: place,
  });
  expect(result.map((row) => row.listing.branchId)).toEqual([a, b]);
  expect(result[0]?.listing.priceFromPaisa).toBe(1800001);
  expect(result[0]?.listing.distanceMeters).toBeCloseTo(111195.08, 1);
  expect(value.token).not.toHaveBeenCalled();
  expect(
    value.requests.every(
      (request) => !request.headers.has('authorization') && request.credentials === 'omit',
    ),
  ).toBe(true);
  const inventory = value.requests.filter((request) => !request.url.includes('/institutions'));
  expect(inventory).toHaveLength(3);
  expect(
    inventory.every(
      (request) => new URL(request.url).searchParams.get('moveInDate') === range.moveInDate,
    ),
  ).toBe(true);
  const overview = value.requests.find(
    (request) => new URL(request.url).pathname === '/v1/marketplace',
  );
  expect(overview && new URL(overview.url).searchParams.get('ids')).toBe([a, b].join(','));
});
it('p.14: comparison without dates or destination keeps unknown availability/distance', async () => {
  const value = fixture();
  const result = await readHostelComparison(value.client, { ids: [a, b] });
  expect(result[0]?.listing).toMatchObject({
    availableBeds: null,
    availableWholeRooms: null,
    distanceMeters: null,
  });
  expect(value.requests).toHaveLength(3);
});
it.each([
  { ids: [a] },
  { ids: [a, a] },
  { ids: [a, b, place, foreign, a] },
  { ids: [a, 'invalid'] },
  { ids: [a, b], range: { moveInDate: '2026-12-01', moveOutDate: '2026-11-01' } },
  { ids: [a, b], customerId: a },
])('p.14 / SEC-003: reject invalid selection before any request %j', async (input) => {
  expect(comparisonInputSchema.safeParse(input).success).toBe(false);
  const value = fixture();
  await expect(readHostelComparison(value.client, input as never)).rejects.toThrow();
  expect(value.requests).toHaveLength(0);
});
it.each([
  { ids: [a] },
  { ids: [a, a] },
  { ids: [a, foreign] },
  { nextCursor: b },
  { typeBranch: foreign },
  { destination: false },
])(
  'ACC-002 / SEC-003: missing/withdrawn/duplicate/foreign sources fail as one comparison %j',
  async (patch) => {
    const value = fixture(patch);
    await expect(
      readHostelComparison(value.client, { ids: [a, b], destinationId: place }),
    ).rejects.toThrow();
  },
);
