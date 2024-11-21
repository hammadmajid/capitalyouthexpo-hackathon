import { randomUUID } from 'node:crypto';
import type { PostingTransaction } from '../src/resident-posting-context.js';
import type { ManualAdmissionContext } from '../src/resident-manual-admission.js';
import { rentIds, rentTerms, rentTime } from './resident-rent.fixture.js';
export const admissionIds = {
  ...rentIds,
  organization: randomUUID(),
  brand: randomUUID(),
  room: randomUUID(),
  type: randomUUID(),
  seat: randomUUID(),
  assignment: randomUUID(),
  history: randomUUID(),
  user: randomUUID(),
};
export const admissionNow = rentTime;
export const admissionInput: ManualAdmissionContext['input'] = {
  scope: {
    organizationId: admissionIds.organization,
    branchId: admissionIds.branch,
    actorUserId: admissionIds.actor,
    actorRole: 'owner',
  },
  manual: {
    resident: { kind: 'new', profile: { displayName: 'Offline resident' } },
    target: { kind: 'bed', roomId: admissionIds.room, bedId: admissionIds.seat },
    period: { moveInDate: '2028-02-01', expectedLeaveDate: '2028-03-01' },
    terms: rentTerms,
  },
  expectedUserId: null,
  initialBilling: [{ item: 'rent', cadence: 'periodic', periodIndex: 0 }],
};
export const admissionTarget = {
  branchId: admissionIds.branch,
  roomTypeId: admissionIds.type,
  roomId: admissionIds.room,
  seatId: admissionIds.seat,
  seatOrdinal: 1,
};
export const admissionParty = {
  residentId: admissionIds.resident,
  branchId: admissionIds.branch,
  userId: null as string | null,
  displayName: 'Offline resident',
};
export const admissionHierarchy = {
  organization: { id: admissionIds.organization, archivedAt: null },
  brand: { id: admissionIds.brand, archivedAt: null },
  branch: { id: admissionIds.branch, archivedAt: null },
};
export function admissionContext(): ManualAdmissionContext {
  return {
    input: admissionInput,
    now: admissionNow,
    target: admissionTarget,
    admittedOn: '2028-02-01',
    party: admissionParty,
    stayId: admissionIds.stay,
    agreementId: admissionIds.agreement,
    assignmentId: admissionIds.assignment,
    historyId: admissionIds.history,
    booking: null,
  };
}
export function admissionWriterFixture(fail?: unknown) {
  const writes: { table: unknown; value: unknown }[] = [];
  const tx = {
    insert(table: unknown) {
      return {
        async values(value: unknown) {
          if (table === fail) throw Error('Required admission write failed');
          writes.push({ table, value });
        },
      };
    },
  };
  return { tx: tx as unknown as PostingTransaction, writes };
}

const oneTimeTerms = {
  ...admissionInput.manual.terms,
  fees: [{ code: 'admission', cadence: 'one_time', amountPaisa: 777 }],
  policy: { ...admissionInput.manual.terms.policy, feeBilling: { oneTimeDueOffsetDays: 0 } },
};
const monthlyTerms = {
  ...admissionInput.manual.terms,
  fees: [{ code: 'mess', cadence: 'monthly', amountPaisa: 501 }],
  policy: {
    ...admissionInput.manual.terms.policy,
    feeBilling: {
      oneTimeDueOffsetDays: 0,
      monthly: {
        cycle: { kind: 'calendar_month', dueDay: 10 },
        proration: { kind: 'full_period' },
      },
    },
  },
};
export const admissionStartRegressions = [
  ...[
    { name: 'future rent', expectedLeaveDate: '2028-06-01' },
    { name: 'exhausted rent', expectedLeaveDate: '2028-03-01' },
  ].map(({ name, expectedLeaveDate }) => ({
    name,
    command: {
      ...admissionInput,
      manual: {
        ...admissionInput.manual,
        period: { ...admissionInput.manual.period, expectedLeaveDate },
      },
      initialBilling: [{ item: 'rent', cadence: 'periodic', periodIndex: 1 }],
    },
  })),
  {
    name: 'exhausted one-time fee',
    command: {
      ...admissionInput,
      manual: { ...admissionInput.manual, terms: oneTimeTerms },
      initialBilling: [
        ...admissionInput.initialBilling,
        { item: 'admission', cadence: 'one_time', periodIndex: 1 },
      ],
    },
  },
  {
    name: 'future independent monthly fee',
    command: {
      ...admissionInput,
      manual: {
        ...admissionInput.manual,
        terms: monthlyTerms,
        period: { ...admissionInput.manual.period, expectedLeaveDate: '2028-06-01' },
      },
      initialBilling: [
        ...admissionInput.initialBilling,
        { item: 'mess', cadence: 'periodic', periodIndex: 1 },
      ],
    },
  },
];
