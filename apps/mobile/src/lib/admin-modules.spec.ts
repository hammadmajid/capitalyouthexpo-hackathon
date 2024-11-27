import { expect, it } from 'vitest';
import type { SelfProfile } from '@hsm/contracts';
import { moduleAllowed } from './admin-modules';
const profile = (root: boolean, roles: string[]) =>
  ({
    user: { id: '10000000-0000-4000-8000-000000000001' },
    capabilities: { admin: { isRoot: root, roles } },
  }) as SelfProfile;
it('ADM-002/003 SEC-003: Root module access is independent of Customer profile', () => {
  for (const module of [
    'verification',
    'moderation',
    'support',
    'safety',
    'announcements',
    'policy',
    'institutions',
    'insights',
    'audit',
    'governance',
  ] as const)
    expect(moduleAllowed(profile(true, []), module)).toBe(true);
});
it('ADM-003 SEC-003: each Normal role has only its approved modules', () => {
  expect(moduleAllowed(profile(false, ['verification']), 'verification')).toBe(true);
  expect(moduleAllowed(profile(false, ['verification']), 'safety')).toBe(false);
  expect(moduleAllowed(profile(false, ['support']), 'announcements')).toBe(true);
  expect(moduleAllowed(profile(false, ['content_moderator']), 'moderation')).toBe(true);
  expect(moduleAllowed(profile(false, ['support']), 'audit')).toBe(false);
  expect(
    moduleAllowed(profile(false, ['verification', 'support', 'content_moderator']), 'policy'),
  ).toBe(false);
});
it('SEC-003: absent or revoked authority denies every staff module', () => {
  expect(moduleAllowed(undefined, 'verification')).toBe(false);
  expect(moduleAllowed({ capabilities: { admin: null } } as SelfProfile, 'support')).toBe(false);
  expect(moduleAllowed(profile(false, []), 'moderation')).toBe(false);
});
