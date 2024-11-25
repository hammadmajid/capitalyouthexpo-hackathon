// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import type { SelfProfile } from '@hsm/contracts';
import { authenticationPath, loginDestination, safeReturnPath } from './return-path';
const profile: SelfProfile = {
  user: {
    id: randomUUID(),
    fullName: 'Identity',
    email: null,
    emailVerified: true,
    cnicLast4: null,
  },
  capabilities: { customer: true, owner: false, managerOf: [], admin: null },
};
it.each([
  '/',
  '/app',
  '/app/security',
  '/app/customer-profile',
  '/app/customer',
  '/app/owner',
  '/app/manager',
  '/app/admin',
])('SEC-001: canonical implemented return path %s is preserved', (path) =>
  expect(safeReturnPath(path)).toBe(path),
);
it.each([
  undefined,
  null,
  [],
  ['/app'],
  {},
  42,
  '',
  ' /app',
  '/app ',
  '//example.test',
  'https://example.test/app',
  'javascript:alert(1)',
  '/\\example.test',
  '\\app',
  '/app\n',
  '/app\r',
  '/app\0',
  '/app\t',
  '%2Fapp',
  '/%2f%2fexample.test',
  '/app%2fowner',
  '/app/../owner',
  '/app/owner/..',
  '/app//owner',
  '/app/',
  '/app?token=private',
  '/app#private',
  '/login',
  '/app/resident',
  '/hostels/private',
  '/app/' + 'x'.repeat(129),
])('SEC-001: noncanonical or unsupported return input %# is rejected', (input) => {
  expect(safeReturnPath(input)).toBeUndefined();
  expect(loginDestination(input, profile)).toBe('/app');
});
it('SEC-001: post-login return checks live capabilities rather than requested experience', () => {
  expect(loginDestination('/app/security', profile)).toBe('/app/security');
  expect(loginDestination('/app/customer', profile)).toBe('/app/customer');
  for (const path of ['/app/owner', '/app/manager', '/app/admin'])
    expect(loginDestination(path, profile)).toBe('/app');
  const granted: SelfProfile = {
    ...profile,
    capabilities: {
      ...profile.capabilities,
      owner: true,
      managerOf: [{ branchId: randomUUID(), branchName: 'Assigned branch' }],
      admin: { isRoot: false, roles: [] },
    },
  };
  for (const path of ['/app/owner', '/app/manager', '/app/admin'])
    expect(loginDestination(path, granted)).toBe(path);
  expect(loginDestination('/', granted)).toBe('/');
  expect(loginDestination('/app', granted)).toBe('/app');
});

it('SEC-001 CHG-006: login and signup links preserve only canonical supported destinations', () => {
  expect(authenticationPath('register', '/app/customer-profile')).toBe(
    '/register?returnTo=%2Fapp%2Fcustomer-profile',
  );
  expect(authenticationPath('login', '/app/owner')).toBe('/login?returnTo=%2Fapp%2Fowner');
  expect(authenticationPath('login', undefined)).toBe('/login');
  expect(authenticationPath('register', 'https://attacker.example/private')).toBe('/register');
});

it('ACC-002 SEC-001: only canonical implemented public hostel detail paths survive login', () => {
  const path = '/hostels/019a1234-1234-7123-8123-123456789abc';
  expect(safeReturnPath(path)).toBe(path);
  expect(loginDestination(path, profile)).toBe(path);
  expect(authenticationPath('login', path)).toBe('/login?returnTo=' + encodeURIComponent(path));
  for (const value of [
    path + '?token=private',
    path + '#private',
    path + '/..',
    path.replace('/hostels/', '/hostels/%2f'),
    '//example.test' + path,
    path.toUpperCase(),
  ])
    expect(safeReturnPath(value)).toBeUndefined();
});
