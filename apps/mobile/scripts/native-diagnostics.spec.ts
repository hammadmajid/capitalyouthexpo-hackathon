import { expect, it } from 'vitest';
import { NativeCommandFailure, nativeDiagnostic } from './native-diagnostics';
it.each([
  ['Flow parsing failed: private-value', 'invalid_flow'],
  ['No connected devices: private-value', 'device_unavailable'],
  ['UnsupportedClassVersionError private-value', 'toolchain_failed'],
  ['Could not find or load main class private-value', 'toolchain_failed'],
  ['Element not found: private-value', 'assertion_failed'],
  ['No visible element found: private-value', 'assertion_failed'],
  ['Assertion is false: private-value', 'assertion_failed'],
  ['unrecognized private-value failure', 'command_failed'],
])(
  'SEC-003: native diagnostics classify failure without reflecting tool output',
  (output, failure) => {
    const diagnostic = nativeDiagnostic(output, false);
    expect(diagnostic).toEqual({ failure, action: 'unknown' });
    expect(new NativeCommandFailure(diagnostic).message).not.toContain('private-value');
  },
);
it('SEC-003: timeout is explicit and only a static last input label is retained', () => {
  const output =
    'Enter test identity number private-value\nEnter test email private-value\nElement not found';
  expect(nativeDiagnostic(output, true)).toEqual({ failure: 'timed_out', action: 'email' });
});
it.each([
  ['Enter test display name', 'display_name'],
  ['Enter test mobile number', 'phone'],
  ['Enter test password', 'password'],
  ['Enter adult birth date', 'birth_date'],
  ['Enter test identity number', 'identity_number'],
  ['Enter verification code', 'verification_code'],
])('SEC-003: allowlisted step identifiers never contain entered values', (label, action) => {
  const diagnostic = nativeDiagnostic(label + ' private-value', false);
  expect(diagnostic).toEqual({ failure: 'command_failed', action });
  expect(new NativeCommandFailure(diagnostic).message).not.toContain('private-value');
});
it('SEC-003: unknown JSON, identities, tokens, paths and command arguments are discarded', () => {
  const diagnostic = nativeDiagnostic(
    '{"password":"private-value","otp":"private-value","cnic":"private-value",' +
      '"authorization":"private-value","phone":"private-value","path":"private-value"}',
    false,
  );
  expect(new NativeCommandFailure(diagnostic).message).toBe(
    'Native command failed: command_failed; last input: unknown',
  );
});
