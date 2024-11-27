import { expect, it } from 'vitest';
import { prepareLogin } from './login-input';
const password = 'Fixture password';
it('AUTH-C: email becomes the existing identifier without altering the password', () => {
  expect(prepareLogin({ email: ' Identity@Example.com ', phone: '', password })).toEqual({
    ok: true,
    values: { identifier: 'identity@example.com', password },
  });
});
it.each(['03001234567', '923001234567', '+923001234567'])(
  'AUTH-M-005: shared normalization handles %s',
  (phone) => {
    expect(prepareLogin({ email: '', phone, password })).toEqual({
      ok: true,
      values: { identifier: '+923001234567', password },
    });
  },
);
it.each([
  [{ email: '', phone: '', password }, 'Enter your email or phone number.'],
  [{ email: 'a@example.com', phone: '03001234567', password }, 'Use either email or phone number.'],
  [{ email: 'broken', phone: '', password }, 'Enter a valid email address.'],
  [{ email: '', phone: 'bad', password }, 'Enter a valid Pakistani mobile number.'],
])('SEC-001: invalid identifiers never produce credentials', (input, message) => {
  const result = prepareLogin(input);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(Object.values(result.errors)).toContain(message);
});
it.each(['', 'short', 'p'.repeat(129)])('SEC-001: password contract is retained', (password) => {
  const result = prepareLogin({ email: 'a@example.com', phone: '', password });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.errors.password).toBeTruthy();
});
