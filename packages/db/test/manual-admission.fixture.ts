import { and, eq, inArray, sql } from 'drizzle-orm';
import { v7 } from 'uuid';
import {
  billingAgreementTermsSchema,
  DomainError,
  type BillingAgreementTerms,
  type FeeBillingPolicy,
} from '@hsm/contracts';
import {
  billingPolicies,
  residents,
  stays,
  stayHistory,
  stayAssignments,
  stayAgreements,
  residentCharges,
  residentInvoices,
  residentLedger,
  residentBillingSchedules,
  hostelAuditLog,
  notificationOutbox,
  organizations,
  branches,
  users,
} from '../src/index.js';
import {
  admitManualResident,
  type ManualAdmissionAuthorizer,
} from '../src/resident-manual-admission.js';
import { inventoryHarness } from './inventory.fixture.js';
export const manualAdmissionTime = new Date('2028-02-01T06:00:00Z');
type Harness = ReturnType<typeof inventoryHarness>;
export async function manualAdmissionScope(
  harness: Harness,
  setup: {
    fees?: BillingAgreementTerms['fees'];
    feeBilling?: FeeBillingPolicy;
    openEnded?: boolean;
    typePolicy?: boolean;
  } = {},
) {
  const f = await harness.scope(),
    id = v7();
  const terms = billingAgreementTermsSchema.parse({
    policyVersionId: id,
    currency: 'PKR',
    fees: setup.fees ?? [],
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
      allowOpenEnded: setup.openEnded ?? false,
      customCharges: 'disabled',
      ...(setup.feeBilling === undefined ? {} : { feeBilling: setup.feeBilling }),
    },
  });
  await harness
    .database()
    .insert(billingPolicies)
    .values({
      id,
      branchId: f.branchId,
      roomTypeId: setup.typePolicy ? f.roomTypeId : null,
      policy: terms.policy,
      isCurrent: true,
      createdByUserId: f.ownerId,
    });
  return { ...f, terms };
}
export function manualCommand(f: Awaited<ReturnType<typeof manualAdmissionScope>>) {
  return {
    scope: {
      organizationId: f.organizationId,
      branchId: f.branchId,
      actorUserId: f.ownerId,
      actorRole: 'owner' as const,
    },
    manual: {
      resident: { kind: 'new' as const, profile: { displayName: 'Offline resident' } },
      target: { kind: 'bed' as const, roomId: f.roomId, bedId: f.seatId },
      period: {
        moveInDate: '2028-02-01',
        expectedLeaveDate: f.terms.policy.allowOpenEnded ? null : '2028-03-01',
      },
      terms: f.terms,
    },
    expectedUserId: null as string | null,
    initialBilling: [{ item: 'rent' as const, cadence: 'periodic' as const, periodIndex: 0 }],
  };
}
// Component fixture proves live actual owner and ordered account participants.
// It does not claim HTTP session, delegated Manager or client acceptance.
export const authorizeManualFixture: ManualAdmissionAuthorizer = async (tx, input) => {
  const ids = [
    ...new Set([
      input.scope.actorUserId,
      ...(input.expectedUserId === null ? [] : [input.expectedUserId]),
    ]),
  ].sort();
  const locked = await tx
    .select({ id: users.id, status: users.accountStatus })
    .from(users)
    .where(inArray(users.id, ids))
    .orderBy(users.id)
    .for('update');
  if (locked.length !== ids.length || locked.some((row) => row.status !== 'active'))
    throw new DomainError('FORBIDDEN', 403, 'Fixture participant unavailable');
  const [owner] = await tx
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.id, input.scope.organizationId),
        eq(organizations.ownerUserId, input.scope.actorUserId),
      ),
    )
    .for('update');
  const [branch] = await tx
    .select({ id: branches.id })
    .from(branches)
    .where(
      and(
        eq(branches.id, input.scope.branchId),
        eq(branches.organizationId, input.scope.organizationId),
      ),
    );
  if (!owner || !branch || input.scope.actorRole !== 'owner')
    throw new DomainError('BRANCH_FORBIDDEN', 403, 'Fixture owner scope unavailable');
};
export function runManualAdmission(harness: Harness, value: unknown) {
  return harness
    .database()
    .transaction((tx) =>
      admitManualResident(tx, value, manualAdmissionTime, authorizeManualFixture),
    );
}
export async function manualBranchRows(harness: Harness, branchId: string) {
  const db = harness.database();
  const rows = await Promise.all([
    db.select({ id: residents.id }).from(residents).where(eq(residents.branchId, branchId)),
    db.select({ id: stays.id }).from(stays).where(eq(stays.branchId, branchId)),
    db
      .select({ id: stayAgreements.id })
      .from(stayAgreements)
      .where(eq(stayAgreements.branchId, branchId)),
    db
      .select({ id: stayAssignments.id })
      .from(stayAssignments)
      .where(eq(stayAssignments.branchId, branchId)),
    db
      .select({ id: residentCharges.id })
      .from(residentCharges)
      .where(eq(residentCharges.branchId, branchId)),
    db
      .select({ id: residentInvoices.id })
      .from(residentInvoices)
      .where(eq(residentInvoices.branchId, branchId)),
    db
      .select({ id: residentLedger.id })
      .from(residentLedger)
      .where(eq(residentLedger.branchId, branchId)),
    db
      .select({ id: residentBillingSchedules.id })
      .from(residentBillingSchedules)
      .where(eq(residentBillingSchedules.branchId, branchId)),
    db.select({ id: stayHistory.id }).from(stayHistory).where(eq(stayHistory.branchId, branchId)),
    db
      .select({ id: hostelAuditLog.id })
      .from(hostelAuditLog)
      .where(eq(hostelAuditLog.branchId, branchId)),
  ]);
  return rows.map((values) => values.length);
}
export async function totalAdmissionOutbox(harness: Harness) {
  const [row] = await harness
    .database()
    .select({ count: sql<string>`count(*)::text` })
    .from(notificationOutbox);
  if (!row) throw Error('Outbox count missing');
  return row.count;
}
