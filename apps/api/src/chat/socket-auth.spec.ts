import { expect, it } from 'vitest';
import { chatSocketToken } from './socket-auth.js';
it('COMM-001 / SEC-003: native credentials and exact environment cookies authenticate', () => {
  expect(chatSocketToken({ token: 'native' }, undefined, true)).toBe('native');
  expect(chatSocketToken({}, 'other=x; hsm_access=browser%20token', false)).toBe('browser token');
  expect(chatSocketToken({}, '__Host-hsm_access=secure', true)).toBe('secure');
});
it.each([
  [{}, undefined, false],
  [{ token: 'native' }, 'hsm_access=browser', false],
  [{}, 'hsm_access=one; hsm_access=two', false],
  [{}, 'hsm_access=wrong-environment', true],
  [{}, 'prefix_hsm_access=wrong-name', false],
  [{}, 'hsm_access=%invalid', false],
  [{ token: '', extra: true }, undefined, false],
] as const)(
  'COMM-001: missing, ambiguous and malformed socket credentials fail closed',
  (auth, cookie, secure) => {
    expect(() => chatSocketToken(auth, cookie, secure)).toThrow();
  },
);
