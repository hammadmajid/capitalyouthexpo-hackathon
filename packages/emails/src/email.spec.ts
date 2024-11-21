import { expect, it } from 'vitest';
import { managerWelcomeEmail, otpEmail } from './index.js';
const input = {
  email: 'person@example.test',
  code: '482731',
  purpose: 'signup_verify' as const,
  expiresAt: '2026-10-07T12:00:00.000Z',
};
it('AUTH-C-002: renders verification and reset codes in HTML and plain text', async () => {
  for (const purpose of ['signup_verify', 'password_reset', 'email_change'] as const) {
    const mail = await otpEmail({ ...input, purpose });
    expect(mail.subject).toBe(
      purpose === 'password_reset' ? 'Reset your password' : 'Verify your email',
    );
    expect(mail.html).toContain(input.code);
    expect(mail.text).toContain(input.code);
    expect(mail.text).toContain('Never share');
    expect(mail.html).toContain('Twin Cities Hostels');
  }
});
it('AUTH-M: welcome text escapes identity and contains no temporary password', async () => {
  const mail = await managerWelcomeEmail('<script>alert(1)</script>');
  expect(mail.html).not.toContain('<script>');
  expect(mail.html).toContain('&lt;script&gt;');
  expect(mail.text).toContain('Ask your owner');
  expect(mail.subject).toBe('Your manager invitation');
});
it('SEC: invalid email payloads are rejected at the template boundary', async () => {
  await expect(otpEmail({ ...input, code: '<script>' })).rejects.toThrow();
  await expect(managerWelcomeEmail('')).rejects.toThrow();
});
