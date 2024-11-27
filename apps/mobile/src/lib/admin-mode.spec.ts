import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));
import * as storage from 'expo-secure-store';
import type { SelfProfile } from '@hsm/contracts';
import { entryFor, readMode, rememberMode } from './owner-mode';
const profile = (caps: Partial<SelfProfile['capabilities']>) =>
  ({
    user: { id: 'actor', emailVerified: true },
    capabilities: { customer: false, owner: false, managerOf: [], admin: null, ...caps },
  }) as SelfProfile;
beforeEach(() => vi.clearAllMocks());
it('ADM-002: Root defaults to Admin without a Customer profile', () => {
  expect(entryFor(profile({ admin: { isRoot: true, roles: [] } }), undefined)).toBe('/admin');
});
it('CHG-005 ADM-002: Admin entry takes priority over remembered Customer/Owner modes', () => {
  const p = profile({ customer: true, owner: true, admin: { isRoot: true, roles: [] } });
  expect(entryFor(p, 'customer')).toBe('/admin');
  expect(entryFor(p, 'owner')).toBe('/admin');
  expect(entryFor(p, 'admin')).toBe('/admin');
  expect(entryFor(profile({ owner: true }), undefined)).toBe('/owner');
  expect(entryFor(profile({ customer: true }), 'admin')).toBe('/marketplace');
});
it.each(['customer', 'owner', 'admin', undefined] as const)(
  'SEC-001 ADM-002: delegated Admin also takes priority over %s preference',
  (mode) => {
    expect(
      entryFor(
        profile({ customer: true, owner: true, admin: { isRoot: false, roles: ['support'] } }),
        mode,
      ),
    ).toBe('/admin');
  },
);
it('SEC-001: per-user preference persists only a mode string, never grants', async () => {
  vi.mocked(storage.getItemAsync).mockResolvedValue('admin');
  expect(await readMode('actor')).toBe('admin');
  await rememberMode('actor', 'admin');
  await rememberMode('another', 'customer');
  expect(vi.mocked(storage.setItemAsync).mock.calls[0]?.[0]).not.toBe(
    vi.mocked(storage.setItemAsync).mock.calls[1]?.[0],
  );
  expect(vi.mocked(storage.setItemAsync).mock.calls[0]?.[1]).toBe('admin');
});
