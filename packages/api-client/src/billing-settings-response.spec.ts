import { expect, it, vi } from 'vitest';
import { billingPolicySchema } from '@hsm/contracts';
import { createApiClient } from './client.js';
import { saveBillingSettings } from './billing-settings.js';
const branchId = '10000000-0000-4000-8000-000000000001',
  roomTypeId = '10000000-0000-4000-8000-000000000002',
  id = '10000000-0000-4000-8000-000000000003';
const policy = billingPolicySchema.parse({
  cycle: { kind: 'week', dueOffsetDays: 0 },
  proration: { kind: 'full_period' },
  graceDays: 0,
  lateCharge: { kind: 'disabled' },
  noticeDays: 7,
  earlyCheckout: { kind: 'manual' },
  allowOpenEnded: true,
  customCharges: 'disabled',
});
function fixture(returnedPolicy: unknown, typed: boolean) {
  const row = {
    id,
    level: typed ? 'room_type' : 'branch',
    scopeId: typed ? roomTypeId : branchId,
    createdAt: '2026-10-19T10:00:00.000Z',
    policy: returnedPolicy,
  };
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(row));
  return {
    row,
    fetch,
    client: createApiClient({
      baseUrl: 'https://api.example.test',
      authentication: { kind: 'cookie', csrf: () => 'fixture' },
      fetch,
    }),
  };
}
const patches = [
  { cycle: { kind: 'calendar_month', dueDay: 8 } },
  { proration: { kind: 'manual' } },
  { graceDays: 3 },
  { lateCharge: { kind: 'fixed', amountPaisa: 100 } },
  { noticeDays: 14 },
  { earlyCheckout: { kind: 'full_period' } },
  { allowOpenEnded: false },
  { customCharges: 'catalog_only' },
  { feeBilling: { oneTimeDueOffsetDays: 2 } },
];
it.each(patches.flatMap((patch) => [false, true].map((typed) => ({ patch, typed }))))(
  'RENT-003 / FIN-004: mismatched valid saved policy case %# cannot report success',
  async ({ patch, typed }) => {
    const f = fixture({ ...policy, ...patch }, typed),
      target = { branchId, ...(typed ? { roomTypeId } : {}) };
    await expect(saveBillingSettings(f.client, target, { policy }, id)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
    expect(f.fetch).toHaveBeenCalledTimes(1);
  },
);
it.each([false, true])(
  'FIN-004: saved type=%s cannot discard explicit monthly fee timing',
  async (typed) => {
    const configured = {
      ...policy,
      feeBilling: {
        oneTimeDueOffsetDays: 2,
        monthly: {
          cycle: { kind: 'anniversary_month', dueOffsetDays: 1 },
          proration: { kind: 'calendar_days', rounding: 'down' },
        },
      },
    };
    const f = fixture(policy, typed);
    await expect(
      saveBillingSettings(
        f.client,
        { branchId, ...(typed ? { roomTypeId } : {}) },
        { policy: configured },
        id,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  },
);
it('RENT-003: reordered JSON properties and omitted undefined fee timing retain equivalent financial facts', async () => {
  const reordered = {
    customCharges: policy.customCharges,
    allowOpenEnded: policy.allowOpenEnded,
    earlyCheckout: policy.earlyCheckout,
    noticeDays: policy.noticeDays,
    lateCharge: policy.lateCharge,
    graceDays: policy.graceDays,
    proration: policy.proration,
    cycle: policy.cycle,
  };
  const f = fixture(reordered, false);
  expect(
    await saveBillingSettings(
      f.client,
      { branchId },
      { policy: { ...policy, feeBilling: undefined } },
      id,
    ),
  ).toEqual({ ...f.row, policy });
});
