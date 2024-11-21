import { randomUUID } from 'node:crypto';
import type { SQL } from 'drizzle-orm';
import {
  stays,
  stayHistory,
  stayAssignments,
  stayAgreements,
  branches,
  notificationOutbox,
  type Database,
} from '@hsm/db';
import { NotificationRepository } from '../../src/repository.js';
import type { ResidentLifecycleLease } from '../../src/contracts.js';
export const residentNow = new Date('2028-02-01T06:00:00Z');
export const residentIds = {
  stay: randomUUID(),
  history: randomUUID(),
  branch: randomUUID(),
  resident: randomUUID(),
  assignment: randomUUID(),
  agreement: randomUUID(),
  owner: randomUUID(),
  user: randomUUID(),
};
export const residentLease: ResidentLifecycleLease = {
  id: randomUUID(),
  eventType: 'resident.lifecycle',
  channel: 'in_app',
  recipientUserId: null,
  payload: { event: 'resident.admitted', stayId: residentIds.stay, historyId: residentIds.history },
  leaseToken: randomUUID(),
  leaseExpiresAt: new Date(residentNow.getTime() + 60000),
};
type Row = typeof notificationOutbox.$inferSelect;
type ClockState = {
  clock: Date;
  lockAdvance: Date | undefined;
  insertAdvance: Date | undefined;
  queueFailure: boolean;
};
type Capture = {
  predicates: { table: unknown; value: SQL }[];
  locks: { table: unknown; mode: string }[];
  limits: number[];
  writes: { table: unknown; value: unknown }[];
  updates: Partial<Row>[];
};
function outboxRow(change: Partial<Row>): Row {
  return {
    ...residentLease,
    payload: { ...residentLease.payload },
    recipientAddress: null,
    dedupeKey: 'resident-fixture',
    status: 'pending',
    attempts: 1,
    nextAttemptAt: residentNow,
    lastError: null,
    providerMessageId: null,
    createdAt: residentNow,
    sentAt: null,
    ...change,
  };
}
function sourceRows(row: Row) {
  const ids = residentIds,
    now = residentNow;
  const stay = {
    id: ids.stay,
    branchId: ids.branch,
    residentId: ids.resident,
    userId: ids.user,
    source: 'manual',
    checkedInAt: now,
  };
  const history = {
    id: ids.history,
    branchId: ids.branch,
    stayId: ids.stay,
    previousState: null,
    nextState: 'active',
    reasonCode: 'manual_admission',
    createdAt: now,
    detail: {
      residentId: ids.resident,
      userId: ids.user,
      assignmentId: ids.assignment,
      agreementId: ids.agreement,
      source: 'manual',
    },
  };
  const assignment = { id: ids.assignment, branchId: ids.branch, stayId: ids.stay, startedAt: now };
  const agreement = { id: ids.agreement, branchId: ids.branch, stayId: ids.stay, version: 1 };
  const data = new Map<unknown, unknown[]>([
    [notificationOutbox, [row]],
    [stays, [stay]],
    [stayHistory, [history]],
    [stayAssignments, [assignment]],
    [stayAgreements, [agreement]],
    [branches, [{ userId: ids.owner }]],
  ]);
  return { stay, history, assignment, agreement, data };
}
function selectFactory(data: Map<unknown, unknown[]>, capture: Capture, state: ClockState) {
  return () => {
    let table: unknown;
    const query = {
      from(value: unknown) {
        table = value;
        return query;
      },
      where(value: SQL) {
        capture.predicates.push({ table, value });
        return query;
      },
      innerJoin() {
        return query;
      },
      limit(value: number) {
        capture.limits.push(value);
        return query;
      },
      for(mode: string) {
        capture.locks.push({ table, mode });
        if (state.lockAdvance) state.clock = state.lockAdvance;
        return query;
      },
      then(resolve: (values: unknown[]) => unknown, reject: (error: unknown) => unknown) {
        return Promise.resolve(data.get(table) ?? []).then(resolve, reject);
      },
    };
    return query;
  };
}
function writePort(capture: Capture, state: ClockState) {
  return {
    insert(table: unknown) {
      return {
        values(value: unknown) {
          capture.writes.push({ table, value });
          return {
            async onConflictDoNothing() {
              if (state.queueFailure) throw Error('Required resident queue failed');
              if (state.insertAdvance) state.clock = state.insertAdvance;
            },
          };
        },
      };
    },
    update() {
      return {
        set(value: Partial<Row>) {
          return {
            async where() {
              capture.updates.push(value);
            },
          };
        },
      };
    },
  };
}
export function residentFixture(change: Partial<Row> = {}) {
  const state: ClockState = {
    clock: residentNow,
    lockAdvance: undefined,
    insertAdvance: undefined,
    queueFailure: false,
  };
  const row = outboxRow(change),
    source = sourceRows(row);
  const capture: Capture = { predicates: [], locks: [], limits: [], writes: [], updates: [] };
  const tx = { select: selectFactory(source.data, capture, state), ...writePort(capture, state) };
  const database = {
    transaction: async (work: (value: unknown) => Promise<unknown>) => work(tx),
  } as unknown as Database;
  return {
    ...source,
    row,
    ...capture,
    repository: new NotificationRepository(database, () => state.clock),
    advanceLock(value: Date) {
      state.lockAdvance = value;
    },
    advanceInsert(value: Date) {
      state.insertAdvance = value;
    },
    failQueue() {
      state.queueFailure = true;
    },
    setClock(value: Date) {
      state.clock = value;
    },
  };
}
