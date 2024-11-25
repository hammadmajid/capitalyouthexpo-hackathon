import { expect, it } from 'vitest';
import { customerProfilePath } from './return-path';
it('BKG-001 / SEC-001: profile completion can preserve a canonical hostel return', () => {
  const path = '/hostels/550e8400-e29b-41d4-a716-446655440000';
  const result = new URL(customerProfilePath(path), 'https://example.test');
  expect(result.origin).toBe('https://example.test');
  expect(result.pathname).toBe('/app/customer-profile');
  expect(result.searchParams.get('returnTo')).toBe(path);
  expect([...result.searchParams.keys()]).toEqual(['returnTo']);
});
it.each(
  [
    undefined,
    ['/'],
    'https://attacker.example',
    '//attacker.example',
    '/hostels/invalid',
    '/app/customer?token=private',
  ].map((value) => ({ value })),
)('SEC-001: untrusted profile destinations cannot enter a return link %#', ({ value }) => {
  expect(customerProfilePath(value)).toBe('/app/customer-profile');
});
