import { randomUUID } from 'node:crypto';
import type { SQL } from 'drizzle-orm';
import type { BillingAgreementTerms } from '@hsm/contracts';
import type { Database } from '../src/index.js';
import {
  branches,
  brands,
  organizations,
  stays,
  stayAgreements,
  residentBillingSchedules,
  notificationOutbox,
  residentCharges,
  residentInvoiceCharges,
} from '../src/schema/index.js';
import { residentBillingJobKey } from '../src/resident-billing-job.js';
import { rentIds, rentTime, rentStay, rentAgreement, rentTerms } from './resident-rent.fixture.js';
export type BillingFixtureOptions = {
  schedule?: Partial<typeof residentBillingSchedules.$inferSelect>;
  lockedSchedule?: Partial<typeof residentBillingSchedules.$inferSelect> | null;
  job?: Partial<typeof notificationOutbox.$inferSelect>;
  lockedJob?: Partial<typeof notificationOutbox.$inferSelect> | null;
  stay?: Partial<typeof stays.$inferSelect>;
  agreement?: Partial<typeof stayAgreements.$inferSelect>;
  terms?: BillingAgreementTerms;
  periodIndex?: number;
  inputVersion?: number;
  previous?: (typeof residentCharges.$inferSelect)[];
  missingTarget?: boolean;
  missingStay?: boolean;
  missingJob?: boolean;
  archived?: 'organization' | 'brand' | 'branch';
  ackRows?: { id: string }[];
  fail?: { table: unknown; kind: 'insert' | 'update' };
};
type State = ReturnType<typeof fixtureData> & {
  options: BillingFixtureOptions;
  writes: { kind: 'insert' | 'update'; table: unknown; value: Record<string, unknown> }[];
  locks: { table: unknown; mode: string }[];
  predicates: { table: unknown; value: SQL }[];
};
function fixtureJob(id: string, jobId: string, options: BillingFixtureOptions) {
  const payload = {
    scheduleId: id,
    version: options.inputVersion ?? 1,
    periodIndex: options.periodIndex ?? 0,
  };
  const job = {
    id: jobId,
    eventType: 'resident.billing.period',
    channel: 'internal' as const,
    recipientUserId: null,
    recipientAddress: null,
    payload,
    dedupeKey: residentBillingJobKey(payload),
    status: 'pending' as const,
    attempts: 1,
    nextAttemptAt: rentTime,
    lastError: null,
    providerMessageId: null,
    createdAt: new Date(rentTime.getTime() - 1000),
    sentAt: null,
    leaseToken: randomUUID(),
    leaseExpiresAt: new Date(rentTime.getTime() + 60000),
  };
  return job;
}
function fixtureData(options: BillingFixtureOptions) {
  const id = randomUUID(),
    jobId = randomUUID(),
    organizationId = randomUUID(),
    brandId = randomUUID();
  const job = fixtureJob(id, jobId, options);
  const input = { ...job };
  const storedJob: typeof notificationOutbox.$inferSelect = { ...job, ...options.job };
  const schedule: typeof residentBillingSchedules.$inferSelect = {
    id,
    branchId: rentIds.branch,
    stayId: rentIds.stay,
    agreementId: rentIds.agreement,
    item: 'rent',
    cadence: 'periodic',
    state: 'active',
    authorizedByUserId: rentIds.actor,
    authorizationAuditId: 1n,
    version: 1,
    periodIndex: BigInt(options.periodIndex ?? 0),
    nextRunAt: rentTime,
    currentJobId: jobId,
    createdAt: rentTime,
    updatedAt: rentTime,
    ...options.schedule,
  };
  const terms = options.terms ?? rentTerms;
  const stay = rentStay({ state: 'active', checkedInAt: rentTime, ...options.stay });
  const agreement = rentAgreement({
    termsSnapshot: terms,
    rentAmountPaisa: BigInt(terms.rentAmountPaisa),
    depositPaisa: BigInt(terms.depositPaisa),
    ...options.agreement,
  });
  const archive = (kind: string) => (options.archived === kind ? rentTime : null);
  const rows = new Map<unknown, unknown[]>([
    [residentBillingSchedules, options.missingTarget ? [] : [schedule]],
    [stays, options.missingStay ? [] : [stay]],
    [stayAgreements, [agreement]],
    [branches, [{ id: rentIds.branch, organizationId, brandId, archivedAt: archive('branch') }]],
    [brands, [{ id: brandId, organizationId, archivedAt: archive('brand') }]],
    [organizations, [{ id: organizationId, archivedAt: archive('organization') }]],
    [notificationOutbox, options.missingJob ? [] : [storedJob]],
    [residentCharges, options.previous ?? []],
    [residentInvoiceCharges, [{ invoiceId: rentIds.invoice }]],
  ]);
  return { input, storedJob, schedule, stay, rows, organizationId, jobId };
}
function select(state: State) {
  let table: unknown,
    locked = false;
  const query = {
    from(value: unknown) {
      table = value;
      return query;
    },
    where(value: SQL) {
      state.predicates.push({ table, value });
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
      locked = true;
      state.locks.push({ table, mode });
      return query;
    },
    then(resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) {
      const value =
        table === residentBillingSchedules && locked && state.options.lockedSchedule !== undefined
          ? state.options.lockedSchedule === null
            ? []
            : [{ ...state.schedule, ...state.options.lockedSchedule }]
          : table === notificationOutbox && locked && state.options.lockedJob !== undefined
            ? state.options.lockedJob === null
              ? []
              : [{ ...state.storedJob, ...state.options.lockedJob }]
            : (state.rows.get(table) ?? []);
      return Promise.resolve(value).then(resolve, reject);
    },
  };
  return query;
}

function update(state: State, table: unknown) {
  return {
    set(value: Record<string, unknown>) {
      const query = {
        where(predicate: SQL) {
          fail(state, table, 'update');
          state.predicates.push({ table, value: predicate });
          state.writes.push({ kind: 'update', table, value });
          return query;
        },
        returning() {
          return Promise.resolve(state.options.ackRows ?? [{ id: state.jobId }]);
        },
        then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
          return Promise.resolve(undefined).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

function fail(state: State, table: unknown, kind: 'insert' | 'update') {
  const failure = state.options.fail;
  if (failure && failure.table === table && failure.kind === kind)
    throw new Error('Fixture write failed');
}
export function billingDeliveryFixture(options: BillingFixtureOptions = {}) {
  const state: State = { ...fixtureData(options), options, writes: [], locks: [], predicates: [] };
  const tx = {
    select: () => select(state),
    update: (table: unknown) => update(state, table),
    insert(table: unknown) {
      return {
        values(value: Record<string, unknown>) {
          const write = (async () => {
            fail(state, table, 'insert');
            state.writes.push({ kind: 'insert', table, value });
          })();
          // Rent notices use ON CONFLICT DO NOTHING; the double records the same insert.
          return Object.assign(write, { onConflictDoNothing: () => write });
        },
      };
    },
  };
  const database = { transaction: async <T>(work: (value: unknown) => Promise<T>) => work(tx) };
  return {
    database: database as unknown as Database,
    input: state.input,
    schedule: state.schedule,
    stay: state.stay,
    storedJob: state.storedJob,
    writes: state.writes,
    locks: state.locks,
    predicates: state.predicates,
    organizationId: state.organizationId,
    rows: state.rows,
  };
}
