import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { marketplaceSearch, emptyMarketplaceSearch } from './marketplace-search';
it('ACC-002: default search has no invented filters or availability', () => {
  expect(marketplaceSearch(emptyMarketplaceSearch)).toEqual({
    q: '',
    availableOnly: false,
    limit: 20,
  });
});
it('ACC-002 / BKG-004: typed category, exact fractional rupees and complete dates survive normalization', () => {
  expect(
    marketplaceSearch({
      ...emptyMarketplaceSearch,
      q: ' H-13 ',
      category: 'boys',
      minimum: '18000.01',
      maximum: '20000.99',
      moveIn: '2026-11-01',
      moveOut: '2026-11-03',
      available: true,
    }),
  ).toEqual({
    q: 'H-13',
    category: 'boys',
    minimumRentPaisa: 1800001,
    maximumRentPaisa: 2000099,
    moveInDate: '2026-11-01',
    moveOutDate: '2026-11-03',
    availableOnly: true,
    limit: 20,
  });
});
it('ACC-002: search can retain the selected approved university radius', () => {
  const universityPlaceId = randomUUID();
  expect(
    marketplaceSearch(emptyMarketplaceSearch, { universityPlaceId, radiusMeters: 5000 }),
  ).toMatchObject({ universityPlaceId, radiusMeters: 5000 });
});
it('BKG-004: zero is an explicit rent bound; blank whitespace means no bound', () => {
  expect(marketplaceSearch({ ...emptyMarketplaceSearch, minimum: '0', maximum: ' ' })).toEqual({
    q: '',
    minimumRentPaisa: 0,
    availableOnly: false,
    limit: 20,
  });
});
it.each([
  { minimum: '-1' },
  { maximum: '1.001' },
  { minimum: '1e3' },
  { minimum: '90071992547409999' },
  { minimum: '20', maximum: '10' },
  { category: 'unknown' },
  { available: true },
  { moveIn: '2026-11-01' },
  { moveIn: '2026-11-03', moveOut: '2026-11-01' },
  { moveIn: '2026-02-30', moveOut: '2026-03-01' },
  { q: 'x'.repeat(121) },
  { cursor: randomUUID() },
])('ACC-002: invalid search fails before transport: %j', (changes) => {
  expect(() => marketplaceSearch({ ...emptyMarketplaceSearch, ...changes })).toThrow();
});
