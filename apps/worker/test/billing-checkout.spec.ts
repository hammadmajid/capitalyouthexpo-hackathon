import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import {
  checkoutStay,
  deliverResidentBilling,
  organizations,
  branches,
  stays,
  residentInvoices,
  residentBillingExecutions,
  stayFinalStatements,
  inventoryClaims,
  type LifecycleAuthorizer,
} from '@hsm/db';
import { OutboxRepository } from '../src/repository.js';
import { workerFixture } from './fixture.js';
import { stoppedBillingFixture } from './billing.fixture.js';
let f: Awaited<ReturnType<typeof workerFixture>>;
beforeAll(async () => {
  f = await workerFixture();
});
afterAll(async () => {
  await f?.close();
});
const authorize: LifecycleAuthorizer = async (tx, scope) => {
  const [owner] = await tx
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.id, scope.organizationId),
        eq(organizations.ownerUserId, scope.actorUserId),
      ),
    );
  if (!owner || scope.actorRole !== 'owner') throw new Error('Fixture owner unavailable');
};
it.each(['checkout-first', 'billing-first', 'concurrent'] as const)(
  'AUD-015 / OUT-005/006 / RENT-004 / ACC-004: %s freezes a statement consistent with serialized billing',
  async (mode) => {
    const item = await stoppedBillingFixture(f.database.db, true);
    const [scope] = await f.database.db
      .select({ organizationId: branches.organizationId, actorUserId: organizations.ownerUserId })
      .from(branches)
      .innerJoin(organizations, eq(branches.organizationId, organizations.id))
      .where(eq(branches.id, item.branchId));
    if (!scope) throw new Error('Missing checkout scope');
    const leased = await new OutboxRepository(f.database.db).claim(item.jobId, new Date());
    if (!leased) throw new Error('Missing billing lease');
    const checkout = () =>
      f.database.db.transaction((tx) =>
        checkoutStay(
          tx,
          {
            scope: { ...scope, branchId: item.branchId, stayId: item.stayId, actorRole: 'owner' },
            checkout: {
              expectedVersion: 2,
              reason: 'Billing race acceptance',
              applyAvailableDeposit: false,
            },
          },
          new Date(),
          authorize,
        ),
      );
    const billing = () => deliverResidentBilling(f.database.db, leased);
    if (mode === 'checkout-first') {
      await checkout();
      await billing();
    } else if (mode === 'billing-first') {
      await billing();
      await checkout();
    } else await Promise.all([checkout(), billing()]);
    const invoices = await f.database.db
      .select()
      .from(residentInvoices)
      .where(eq(residentInvoices.stayId, item.stayId));
    const executions = await f.database.db
      .select()
      .from(residentBillingExecutions)
      .where(eq(residentBillingExecutions.jobId, item.jobId));
    const statements = await f.database.db
      .select()
      .from(stayFinalStatements)
      .where(eq(stayFinalStatements.stayId, item.stayId));
    expect(executions).toHaveLength(1);
    expect(statements).toHaveLength(1);
    const posted = executions[0]?.outcome === 'posted';
    expect(executions[0]?.outcome).toBe(posted ? 'posted' : 'obsolete');
    expect(invoices).toHaveLength(posted ? 1 : 0);
    expect(statements[0]?.snapshot).toMatchObject({ outstandingPaisa: posted ? 1800000 : 0 });
    const [stay] = await f.database.db.select().from(stays).where(eq(stays.id, item.stayId));
    expect(stay).toMatchObject({ state: 'completed', version: 3 });
    expect(
      await f.database.db
        .select()
        .from(inventoryClaims)
        .where(
          and(eq(inventoryClaims.branchId, item.branchId), isNull(inventoryClaims.releasedAt)),
        ),
    ).toHaveLength(0);
    await billing();
    expect(
      await f.database.db
        .select()
        .from(residentInvoices)
        .where(eq(residentInvoices.stayId, item.stayId)),
    ).toHaveLength(posted ? 1 : 0);
    if (mode === 'checkout-first') expect(posted).toBe(false);
    if (mode === 'billing-first') expect(posted).toBe(true);
  },
);
