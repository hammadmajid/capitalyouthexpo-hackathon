import { expect, it } from 'vitest';
import { publicMarketplace } from './public-marketplace.js';
it.each([
  '/v1/marketplace',
  '/v1/marketplace/{branchId}',
  '/v1/marketplace/institutions',
  '/v1/marketplace/amenities',
  '/v1/marketplace/media/{mediaId}',
])('ACC-002: discovery %s is anonymous', (path) => {
  expect(publicMarketplace('GET', path)).toBe(true);
  expect(publicMarketplace('HEAD', path)).toBe(true);
});
it('ACC-002: anonymous quotes do not classify mutations as public', () => {
  expect(publicMarketplace('POST', '/v1/marketplace/{branchId}/quote')).toBe(true);
  expect(publicMarketplace('POST', '/v1/marketplace/{branchId}/holds')).toBe(false);
  expect(publicMarketplace('POST', '/v1/marketplace/{branchId}/bookings')).toBe(false);
  expect(publicMarketplace('PUT', '/v1/me/favorites/{branchId}')).toBe(false);
  expect(publicMarketplace('GET', '/v1/marketplace-other')).toBe(false);
  expect(publicMarketplace('GET', '/v1/me/favorites')).toBe(false);
});
