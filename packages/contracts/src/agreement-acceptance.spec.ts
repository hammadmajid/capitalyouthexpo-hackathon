import { expect, it } from 'vitest';
import { agreementAcceptanceInputSchema } from './agreement-acceptance.js';
it('STAY-002 / ACC-002: acknowledgement is explicit and cannot inject actor or timestamp evidence', () => {
  const value = { version: 1, termsDigest: 'a'.repeat(64), acknowledged: true };
  expect(agreementAcceptanceInputSchema.parse(value)).toEqual(value);
  for (const invalid of [
    { ...value, version: 0 },
    { ...value, termsDigest: 'bad' },
    { ...value, acknowledged: false },
    { ...value, acceptedAt: '2026-01-01T00:00:00Z' },
    { ...value, acceptedByUserId: 'spoofed' },
  ])
    expect(agreementAcceptanceInputSchema.safeParse(invalid).success).toBe(false);
});
