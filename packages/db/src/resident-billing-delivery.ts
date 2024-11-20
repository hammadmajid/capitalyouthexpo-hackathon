import { v7 } from 'uuid';
import type { Database } from './index.js';
import { parseResidentBillingDelivery } from './resident-billing-job.js';
import { lockResidentBillingWork } from './resident-billing-lease.js';
import { runCurrentResidentBilling, obsoleteBillingResult } from './resident-billing-run.js';
import { commitResidentBilling } from './resident-billing-commit.js';
// RENT-004 / AUD-004: only a persisted live internal lease authorizes this system transaction.
export async function deliverResidentBilling(
  database: Database,
  value: unknown,
  clock: () => Date = () => new Date(),
): Promise<void> {
  const input = parseResidentBillingDelivery(value);
  await database.transaction(async (tx) => {
    const work = await lockResidentBillingWork(tx, input, clock);
    if (!work) return;
    const current =
      work.schedule.state === 'active' &&
      work.schedule.version === input.payload.version &&
      work.schedule.periodIndex === BigInt(input.payload.periodIndex) &&
      work.schedule.currentJobId === work.job.id;
    const id = v7();
    const result = current ? await runCurrentResidentBilling(tx, work, id) : obsoleteBillingResult;
    await commitResidentBilling(tx, work, result, id, clock);
  });
}
