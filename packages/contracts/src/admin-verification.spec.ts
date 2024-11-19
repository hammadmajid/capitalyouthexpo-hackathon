import { expect, it } from 'vitest';
import {
  verificationCommandInputSchema,
  verificationEvidenceAccessSchema,
  verificationPageQuerySchema,
  verificationPricingSchema,
} from './admin-verification.js';
it('TRUST-002: evidence justification is mandatory, bounded and rejects client authority claims', () => {
  for (const input of [
    { justification: '' },
    { justification: 'short' },
    { justification: 'Valid purpose', rootActive: true },
  ])
    expect(verificationEvidenceAccessSchema.safeParse(input).success).toBe(false);
  expect(
    verificationEvidenceAccessSchema.parse({ justification: ' Owner identity review ' })
      .justification,
  ).toBe('Owner identity review');
});
it('ADM-007: stale-dossier preconditions are optional for legacy clients and strictly typed for new consumers', () => {
  expect(verificationCommandInputSchema.parse({ action: 'approve' })).toEqual({
    action: 'approve',
  });
  expect(
    verificationCommandInputSchema.safeParse({ action: 'approve', expectedStatus: 'invented' })
      .success,
  ).toBe(false);
  expect(
    verificationCommandInputSchema.safeParse({ action: 'approve', expectedUpdatedAt: 'yesterday' })
      .success,
  ).toBe(false);
});
it('ADM-007: bounded pages reject invalid limits/cursors; pricing preserves exact integer strings', () => {
  expect(verificationPageQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
  expect(verificationPageQuerySchema.safeParse({ cursor: 'not-a-uuid' }).success).toBe(false);
  expect(
    verificationPricingSchema.parse({
      data: [
        {
          id: '10000000-0000-4000-8000-000000000001',
          name: 'Shared',
          inventoryMode: 'both',
          capacity: 2,
          bedMonthlyRentPaisa: '9007199254740993',
          roomMonthlyRentPaisa: '9007199254740993',
          depositPaisa: '0',
        },
      ],
      nextCursor: null,
    }).data[0]?.depositPaisa,
  ).toBe('0');
});
