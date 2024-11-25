import { billingPolicies } from '@hsm/db';
import { randomUUID } from 'node:crypto';
import { billingPolicySchema } from '@hsm/contracts';
export const billingIds = {
  branch: randomUUID(),
  type: randomUUID(),
  brand: randomUUID(),
  organization: randomUUID(),
};
export const billingActor = { userId: randomUUID(), sessionId: randomUUID() };
export const billingNow = new Date('2028-02-01T06:00:00.000Z');
export const billingPolicyFixture = billingPolicySchema.parse({
  cycle: { kind: 'calendar_month', dueDay: 5 },
  proration: { kind: 'calendar_days', rounding: 'half_up' },
  graceDays: 3,
  lateCharge: { kind: 'disabled' },
  noticeDays: 15,
  earlyCheckout: { kind: 'manual' },
  allowOpenEnded: true,
  customCharges: 'catalog_only',
});
export function billingRow(patch: Partial<typeof billingPolicies.$inferSelect> = {}) {
  return {
    id: randomUUID(),
    brandId: null,
    branchId: null,
    roomTypeId: null,
    policy: billingPolicyFixture,
    isCurrent: true,
    createdByUserId: billingActor.userId,
    createdAt: billingNow,
    ...patch,
  };
}
export const billingScope = {
  organizationId: billingIds.organization,
  brandId: billingIds.brand,
  ownerId: billingActor.userId,
  actorRole: 'owner' as const,
};
