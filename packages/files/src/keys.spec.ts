import { expect, it } from 'vitest';
import { quarantineKey, verifiedKey, storageKey } from './keys.js';
const id = '11111111-1111-4111-8111-111111111111';
it('SEC: opaque quarantine keys and unique verified snapshots contain no filenames', () => {
  expect(quarantineKey('avatar', id)).toBe('quarantine/avatar/' + id);
  const first = verifiedKey('avatar', id);
  expect(storageKey.parse(first)).toBe(first);
  expect(first).not.toBe(verifiedKey('avatar', id));
  expect(() => quarantineKey('avatar', '../secret')).toThrow();
  expect(() => storageKey.parse('../secret')).toThrow();
});
