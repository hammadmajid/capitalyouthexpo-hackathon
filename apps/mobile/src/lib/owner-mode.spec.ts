import { describe, expect, it, vi } from 'vitest';
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn() }));
import type { SelfProfile } from '@hsm/contracts';
import { entryFor } from './owner-mode';
function profile(caps: Partial<SelfProfile['capabilities']>, emailVerified = true) {
  return {
    user: { emailVerified },
    capabilities: { customer: false, owner: false, managerOf: [], admin: null, ...caps },
  } as unknown as SelfProfile;
}
describe('AUTH-C OWN-001: post-login entry follows server capabilities, not stored mode', () => {
  it('customer-only accounts always enter the marketplace, even with a stale owner preference', () => {
    expect(entryFor(profile({ customer: true }), 'owner')).toBe('/marketplace');
  });
  it('owner accounts land on the Owner dashboard', () => {
    expect(entryFor(profile({ owner: true }), undefined)).toBe('/owner');
    expect(entryFor(profile({ owner: true }), 'customer')).toBe('/owner');
  });
  it('multi-role owners restore Customer mode only when they really have it', () => {
    expect(entryFor(profile({ owner: true, customer: true }), 'customer')).toBe('/marketplace');
    expect(entryFor(profile({ owner: true, customer: true }), 'owner')).toBe('/owner');
  });
  it('MGRD: managers open the Manager workspace; unverified owners keep the hub; Admin defaults to its workspace', () => {
    expect(entryFor(profile({ managerOf: ['b'] as never }), undefined)).toBe('/manager');
    expect(entryFor(profile({ owner: true, admin: { isRoot: true, roles: [] } }), undefined)).toBe(
      '/admin',
    );
    expect(entryFor(profile({ owner: true }, false), undefined)).toBe('/account');
  });
});
it('MGRD: a Manager who is also a Customer signs in to the Manager workspace first', () => {
  const both = profile({ customer: true, managerOf: ['b'] as never });
  expect(entryFor(both, undefined)).toBe('/manager');
  // Switching to Customer is a choice inside the session; the next sign-in starts as Manager.
  expect(entryFor(both, 'customer')).toBe('/manager');
});
