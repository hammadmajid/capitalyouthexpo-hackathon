import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { v7 } from 'uuid';
import {
  residentBillingSchedules,
  residentBillingExecutions,
  notificationOutbox,
  residentBillingJobKey,
  RESIDENT_BILLING_EVENT,
} from '../src/index.js';
import { inventoryHarness } from './inventory.fixture.js';
import { financeScope } from './resident-finance.fixture.js';
import { billingScheduleFixture, stopBillingScheduleFixture } from './resident-billing.fixture.js';
import { expectBillingGuard } from './resident-billing-assertions.fixture.js';
const harness = inventoryHarness();
beforeAll(() => harness.start());
afterAll(() => harness.close());
it('AUD-004 / RENT-004: an explicit audited stop retains its actual human authorizer and unadvanced cursor', async () => {
  const scope = await financeScope(harness);
  const after = await harness.database().transaction((tx) => stopBillingScheduleFixture(tx, scope));
  const [schedule] = await harness
    .database()
    .select()
    .from(residentBillingSchedules)
    .where(eq(residentBillingSchedules.id, after.id));
  expect(schedule).toMatchObject({
    state: 'stopped',
    version: 2,
    periodIndex: 0n,
    currentJobId: null,
    nextRunAt: null,
    authorizedByUserId: scope.ownerId,
  });
  expect(
    await harness
      .database()
      .select()
      .from(residentBillingExecutions)
      .where(eq(residentBillingExecutions.stayId, scope.stayId)),
  ).toEqual([]);
});
it.each(['missing', 'wrong_actor', 'wrong_before', 'advance'] as const)(
  'AUD-004 / RENT-004: %s human change cannot silently advance an unbilled period',
  async (mode) => {
    const scope = await financeScope(harness);
    await expectBillingGuard(
      harness.database().transaction((tx) => stopBillingScheduleFixture(tx, scope, mode)),
      'Billing schedule progress proof missing',
    );
    expect(
      await harness
        .database()
        .select()
        .from(residentBillingSchedules)
        .where(eq(residentBillingSchedules.stayId, scope.stayId)),
    ).toEqual([]);
  },
);
it('RENT-004 / ACC-004: a valid new job cannot replace current work without completion or an allowed audited transition', async () => {
  const scope = await financeScope(harness);
  await expectBillingGuard(
    harness.database().transaction(async (tx) => {
      const f = await billingScheduleFixture(tx, scope);
      await tx.insert(residentBillingSchedules).values(f.value);
      const jobId = v7(),
        nextRunAt = new Date(),
        payload = { scheduleId: f.value.id, version: 2, periodIndex: 0 };
      await tx.insert(notificationOutbox).values({
        id: jobId,
        eventType: RESIDENT_BILLING_EVENT,
        channel: 'internal',
        payload,
        dedupeKey: residentBillingJobKey(payload),
        nextAttemptAt: nextRunAt,
      });
      await tx
        .update(residentBillingSchedules)
        .set({ version: 2, currentJobId: jobId, nextRunAt, updatedAt: nextRunAt })
        .where(eq(residentBillingSchedules.id, f.value.id));
    }),
    'Billing schedule progress proof missing',
  );
});
