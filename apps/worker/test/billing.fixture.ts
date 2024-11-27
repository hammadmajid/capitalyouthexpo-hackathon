import { randomUUID } from 'node:crypto';
import { activateBillingFixture } from './billing-active.fixture.js';
import {
  users,
  organizations,
  brands,
  branches,
  residents,
  stays,
  billingPolicies,
  stayAgreements,
  hostelAuditLog,
  notificationOutbox,
  residentBillingSchedules,
  residentBillingJobKey,
  type Database,
} from '@hsm/db';
// Metadata-only stopped work proves dispatch/retry, never successful admission or rent posting.
export async function stoppedBillingFixture(db: Database, active = false) {
  const ownerId = randomUUID(),
    organizationId = randomUUID(),
    brandId = randomUUID(),
    branchId = randomUUID(),
    residentId = randomUUID(),
    stayId = randomUUID(),
    policyId = randomUUID(),
    agreementId = randomUUID(),
    scheduleId = randomUUID(),
    jobId = randomUUID();
  const payload = { scheduleId, version: 1, periodIndex: 0 };
  await db.transaction(async (tx) => {
    const scope = {
      ownerId,
      organizationId,
      brandId,
      branchId,
      residentId,
      stayId,
      policyId,
      agreementId,
      scheduleId,
      jobId,
    };
    await createHierarchy(tx, scope);
    await createStay(tx, scope, active);
    if (active) await activateBillingFixture(tx, scope);
    await authorizeStopped(tx, scope, payload, active);
  });
  return { jobId, scheduleId, stayId, branchId };
}

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type BillingFixtureScope = Record<
  | 'ownerId'
  | 'organizationId'
  | 'brandId'
  | 'branchId'
  | 'residentId'
  | 'stayId'
  | 'policyId'
  | 'agreementId'
  | 'scheduleId'
  | 'jobId',
  string
>;
type Scope = BillingFixtureScope;
const policy = {
  cycle: { kind: 'calendar_month', dueDay: 5 },
  proration: { kind: 'full_period' },
  graceDays: 0,
  lateCharge: { kind: 'disabled' },
  noticeDays: 15,
  earlyCheckout: { kind: 'manual' },
  allowOpenEnded: false,
  customCharges: 'catalog_only',
};
async function createHierarchy(
  tx: Transaction,
  { ownerId, organizationId, brandId, branchId }: Scope,
) {
  await tx.insert(users).values({ id: ownerId, fullName: 'Worker billing fixture' });
  await tx
    .insert(organizations)
    .values({ id: organizationId, ownerUserId: ownerId, name: 'Worker billing fixture' });
  await tx.insert(brands).values({ id: brandId, organizationId, name: 'Worker billing fixture' });
  await tx.insert(branches).values({
    id: branchId,
    organizationId,
    brandId,
    name: 'Worker billing fixture',
    slug: branchId,
  });
}
async function createStay(
  tx: Transaction,
  { ownerId, branchId, residentId, stayId, policyId, agreementId }: Scope,
  active: boolean,
) {
  const from = active ? '2020-02-01' : '2028-02-01';
  const to = active ? '2020-03-01' : '2028-03-01';
  await tx.insert(residents).values({
    id: residentId,
    branchId,
    displayName: 'Private worker fixture',
    createdByUserId: ownerId,
  });
  await tx.insert(stays).values({
    id: stayId,
    branchId,
    residentId,
    source: 'manual',
    state: 'check_in_ready',
    moveInDate: from,
    expectedLeaveDate: to,
    createdByUserId: ownerId,
  });
  await tx
    .insert(billingPolicies)
    .values({ id: policyId, branchId, policy, isCurrent: false, createdByUserId: ownerId });
  await tx.insert(stayAgreements).values({
    id: agreementId,
    branchId,
    stayId,
    version: 1,
    effectiveFrom: from,
    policyVersionId: policyId,
    rentAmountPaisa: 1800000n,
    depositPaisa: 0n,
    termsSnapshot: {
      policyVersionId: policyId,
      currency: 'PKR',
      fees: [],
      catalog: [],
      rentAmountPaisa: 1800000,
      depositPaisa: 0,
      policy,
    },
    reason: 'Stopped-job dispatch fixture',
    createdByUserId: ownerId,
  });
}
async function authorizeStopped(
  tx: Transaction,
  { ownerId, organizationId, branchId, stayId, agreementId, scheduleId, jobId }: Scope,
  payload: { scheduleId: string; version: number; periodIndex: number },
  active: boolean,
) {
  const [audit] = await tx
    .insert(hostelAuditLog)
    .values({
      organizationId,
      branchId,
      actorUserId: ownerId,
      actorRole: 'owner',
      action: 'billing.schedule.authorized',
      targetType: 'resident_billing_schedule',
      targetId: scheduleId,
      after: { agreementId, item: 'rent', cadence: 'periodic', periodIndex: 0 },
    })
    .returning({ id: hostelAuditLog.id });
  if (!audit) throw new Error('Authorization fixture missing');
  await tx.insert(notificationOutbox).values({
    id: jobId,
    eventType: 'resident.billing.period',
    channel: 'internal',
    payload,
    dedupeKey: residentBillingJobKey(payload),
    ...(active ? { nextAttemptAt: new Date('2020-02-05T00:00:00Z') } : {}),
  });
  await tx.insert(residentBillingSchedules).values({
    id: scheduleId,
    branchId,
    stayId,
    agreementId,
    item: 'rent',
    cadence: 'periodic',
    state: active ? 'active' : 'stopped',
    authorizedByUserId: ownerId,
    authorizationAuditId: audit.id,
    version: 1,
    periodIndex: 0n,
    currentJobId: active ? jobId : null,
    nextRunAt: active ? new Date('2020-02-05T00:00:00Z') : null,
  });
}
