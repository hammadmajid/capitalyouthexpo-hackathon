import { expect, it } from 'vitest';
import { nativeUi } from './native-ui';
import { NativeCommandFailure } from './native-diagnostics';
const privateValue = 'PRIVATE-password-otp-refresh-cnic-phone-proof';
const hierarchy = (text: string, app = 'pk.hsm.app') =>
  '<hierarchy><node package="' +
  app +
  '" text="' +
  text +
  '" /><node text="' +
  privateValue +
  '" /></hierarchy>';
it.each([
  ['Unable to start', 'startup_error'],
  ['Unable to continue', 'render_error'],
  ['Choose your space', 'authenticated'],
  ['Connection unavailable', 'connection_error'],
  ['Sign-out incomplete', 'cleanup_error'],
  ['Find your place in the Twin Cities.', 'welcome'],
  ['Create your account', 'registration'],
  ['Verify your email', 'verification'],
  ['Restoring your session…', 'loading'],
  ['Sign out', 'authenticated'],
] as const)('SEC-003: private UI hierarchy retains only the fixed %s state', (text, state) => {
  const ui = nativeUi(hierarchy(text));
  expect(ui).toBe(state);
  const message = new NativeCommandFailure({ failure: 'assertion_failed', action: 'unknown', ui })
    .message;
  expect(message).toContain('; UI state: ' + state);
  expect(message).not.toContain(privateValue);
  expect(message).not.toContain('pk.hsm.app');
});
it('SEC-003: unknown application and outside-application UI disclose no raw data', () => {
  expect(nativeUi(hierarchy(privateValue))).toBe('app_unknown');
  expect(nativeUi(hierarchy('Create your account', privateValue))).toBe('outside_application');
});
it.each([null, {}, privateValue, '<hierarchy>', 'x'.repeat(262145)])(
  'SEC-003: invalid or oversized private hierarchy fails closed',
  (value) => {
    expect(nativeUi(value)).toBe('unavailable');
  },
);
