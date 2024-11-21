import { randomUUID } from 'node:crypto';
import type { SQL } from 'drizzle-orm';
import { billingAgreementTermsSchema } from '@hsm/contracts';
import {
  stays,
  stayAgreements,
  residentCharges,
  residentInvoiceCharges,
} from '../src/schema/index.js';
import type { postAgreedRentPeriod } from '../src/resident-rent.js';
export const rentIds = {
  branch: randomUUID(),
  stay: randomUUID(),
  agreement: randomUUID(),
  actor: randomUUID(),
  policy: randomUUID(),
  resident: randomUUID(),
  charge: randomUUID(),
  invoice: randomUUID(),
};
export const rentTime = new Date('2028-02-01T06:00:00.000Z');
export const rentCommand = {
  branchId: rentIds.branch,
  stayId: rentIds.stay,
  agreementId: rentIds.agreement,
  actorUserId: rentIds.actor,
  periodIndex: 0,
};
export const rentTerms = billingAgreementTermsSchema.parse({
  policyVersionId: rentIds.policy,
  currency: 'PKR',
  fees: [],
  catalog: [],
  rentAmountPaisa: 1800001,
  depositPaisa: 1000001,
  policy: {
    cycle: { kind: 'calendar_month', dueDay: 5 },
    proration: { kind: 'full_period' },
    graceDays: 0,
    lateCharge: { kind: 'disabled' },
    noticeDays: 15,
    earlyCheckout: { kind: 'manual' },
    allowOpenEnded: false,
    customCharges: 'disabled',
  },
});
export function rentStay(
  patch: Partial<typeof stays.$inferSelect> = {},
): typeof stays.$inferSelect {
  return {
    id: rentIds.stay,
    branchId: rentIds.branch,
    residentId: rentIds.resident,
    userId: null,
    bookingId: null,
    source: 'manual',
    state: 'check_in_ready',
    version: 1,
    moveInDate: '2028-02-01',
    expectedLeaveDate: '2028-03-01',
    checkedInAt: null,
    closedAt: null,
    createdByUserId: rentIds.actor,
    createdAt: rentTime,
    updatedAt: rentTime,
    ...patch,
  };
}
export function rentAgreement(
  patch: Partial<typeof stayAgreements.$inferSelect> = {},
): typeof stayAgreements.$inferSelect {
  return {
    id: rentIds.agreement,
    branchId: rentIds.branch,
    stayId: rentIds.stay,
    version: 1,
    effectiveFrom: '2028-02-01',
    policyVersionId: rentIds.policy,
    rentAmountPaisa: 1800001n,
    depositPaisa: 1000001n,
    termsSnapshot: rentTerms,
    bookingSnapshot: null,
    includedTransportRouteIds: [],
    transportBillingSnapshot: null,
    reason: 'Explicit agreement',
    createdByUserId: rentIds.actor,
    createdAt: rentTime,
    ...patch,
  };
}
export function rentCharge(
  patch: Partial<typeof residentCharges.$inferSelect> = {},
): typeof residentCharges.$inferSelect {
  return {
    id: rentIds.charge,
    branchId: rentIds.branch,
    stayId: rentIds.stay,
    agreementId: rentIds.agreement,
    catalogId: null,
    kind: 'rent',
    sourceKey: 'rent:2028-02-01:2028-03-01',
    descriptionSnapshot: 'Rent',
    quantity: 1,
    amountPaisa: 1800001n,
    periodStart: '2028-02-01',
    periodEnd: '2028-03-01',
    postedByUserId: rentIds.actor,
    postedAt: rentTime,
    ...patch,
  };
}
export function rentQueryFixture(
  options: {
    stay?: (typeof stays.$inferSelect)[];
    agreement?: (typeof stayAgreements.$inferSelect)[];
    previous?: (typeof residentCharges.$inferSelect)[];
    invoices?: { invoiceId: string }[];
    fail?: unknown;
  } = {},
) {
  const rows = new Map<unknown, unknown[][]>([
    [stays, [options.stay ?? [rentStay()]]],
    [stayAgreements, [options.agreement ?? [rentAgreement()]]],
    [residentCharges, [options.previous ?? []]],
    [residentInvoiceCharges, [options.invoices ?? [{ invoiceId: rentIds.invoice }]]],
  ]);
  const writes: { table: unknown; value: unknown }[] = [],
    locks: { table: unknown; mode: string }[] = [],
    predicates: { table: unknown; value: SQL }[] = [];
  function select() {
    let table: unknown;
    const query = {
      from(value: unknown) {
        table = value;
        return query;
      },
      where(value: SQL) {
        predicates.push({ table, value });
        return query;
      },
      innerJoin() {
        return query;
      },
      orderBy() {
        return query;
      },
      limit() {
        return query;
      },
      for(mode: string) {
        locks.push({ table, mode });
        return query;
      },
      then(resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) {
        return Promise.resolve(rows.get(table)?.shift() ?? []).then(resolve, reject);
      },
    };
    return query;
  }
  const transaction = {
    select,
    insert(table: unknown) {
      return {
        async values(value: unknown) {
          if (table === options.fail) throw new Error('Posting write failed');
          writes.push({ table, value });
        },
      };
    },
  };
  return {
    transaction: transaction as unknown as Parameters<typeof postAgreedRentPeriod>[0],
    writes,
    locks,
    predicates,
  };
}
