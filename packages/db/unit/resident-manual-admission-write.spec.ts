import { expect, it } from 'vitest';
import {
  stays,
  stayAgreements,
  stayAssignments,
  inventoryClaims,
  stayHistory,
  hostelAuditLog,
} from '../src/schema/index.js';
import {
  writeManualAdmissionRecords,
  writeManualAdmissionHistory,
} from '../src/resident-manual-admission-write.js';
import {
  admissionContext,
  admissionWriterFixture as fixture,
  admissionIds as ids,
} from './resident-manual-admission.fixture.js';
it('STAY-001 / RES-004: prepared manual admission writes exact actual occupancy and canonical date claim without a synthetic booking', async () => {
  const f = fixture(),
    c = admissionContext();
  await writeManualAdmissionRecords(f.tx, c);
  expect(f.writes.map((row) => row.table)).toEqual([
    stays,
    stayAssignments,
    stayAgreements,
    inventoryClaims,
  ]);
  expect(f.writes[0]?.value).toMatchObject({
    id: ids.stay,
    branchId: ids.branch,
    residentId: ids.resident,
    userId: null,
    bookingId: null,
    source: 'manual',
    state: 'active',
    version: 1,
    moveInDate: '2028-02-01',
    expectedLeaveDate: '2028-03-01',
    checkedInAt: c.now,
    closedAt: null,
    createdByUserId: ids.actor,
  });
  expect(f.writes[1]?.value).toMatchObject({
    id: ids.assignment,
    branchId: ids.branch,
    stayId: ids.stay,
    roomTypeId: ids.type,
    roomId: ids.room,
    seatId: ids.seat,
    seatOrdinal: 1,
    startedAt: c.now,
    endedAt: null,
    createdByUserId: ids.actor,
  });
  expect(f.writes[3]?.value).toMatchObject({
    branchId: ids.branch,
    roomId: ids.room,
    seatId: ids.seat,
    seatOrdinal: 1,
    assignmentId: ids.assignment,
    moveInDate: '2028-02-01',
    moveOutDate: '2028-03-01',
    expiresAt: null,
    releasedAt: null,
  });
});
it('RENT-003 / FIN-004: initial manual agreement preserves explicit version and exact integer-paisa snapshots', async () => {
  const f = fixture(),
    c = admissionContext();
  await writeManualAdmissionRecords(f.tx, c);
  expect(f.writes[2]?.value).toMatchObject({
    id: ids.agreement,
    branchId: ids.branch,
    stayId: ids.stay,
    version: 1,
    policyVersionId: c.input.manual.terms.policyVersionId,
    rentAmountPaisa: 1800001n,
    depositPaisa: 1000001n,
    termsSnapshot: c.input.manual.terms,
    bookingSnapshot: null,
  });
});
it('RES-003 / RENT-003: explicit linked identity and original historical billing start retain exact original values', async () => {
  const f = fixture(),
    base = admissionContext(),
    c = {
      ...base,
      party: { ...base.party, userId: ids.user },
      input: {
        ...base.input,
        manual: {
          ...base.input.manual,
          period: { ...base.input.manual.period, moveInDate: '2028-01-01' },
        },
      },
    };
  await writeManualAdmissionRecords(f.tx, c);
  expect(f.writes[0]?.value).toMatchObject({
    userId: ids.user,
    moveInDate: '2028-01-01',
    checkedInAt: c.now,
  });
  expect(f.writes[2]?.value).toMatchObject({ effectiveFrom: '2028-01-01' });
  expect(f.writes[3]?.value).toMatchObject({ moveInDate: '2028-02-01' });
});
it('RES-004: whole-room open-ended occupancy keeps null bed and departure identity', async () => {
  const f = fixture(),
    base = admissionContext(),
    c = {
      ...base,
      target: { ...base.target, seatId: null, seatOrdinal: null },
      input: {
        ...base.input,
        manual: {
          ...base.input.manual,
          period: { ...base.input.manual.period, expectedLeaveDate: null },
        },
      },
    };
  await writeManualAdmissionRecords(f.tx, c);
  expect(f.writes[1]?.value).toMatchObject({ seatId: null, seatOrdinal: null });
  expect(f.writes[3]?.value).toMatchObject({ seatId: null, seatOrdinal: null, moveOutDate: null });
});
it('AUD-004 / NTF-002: append-only admission history retains source identity for later fanout and mandatory audit records the real human', async () => {
  const f = fixture(),
    c = admissionContext();
  await writeManualAdmissionHistory(f.tx, c);
  expect(f.writes.map((row) => row.table)).toEqual([stayHistory, hostelAuditLog]);
  const detail = {
    residentId: ids.resident,
    userId: null,
    assignmentId: ids.assignment,
    agreementId: ids.agreement,
    source: 'manual',
  };
  expect(f.writes[0]?.value).toMatchObject({
    id: ids.history,
    branchId: ids.branch,
    stayId: ids.stay,
    actorUserId: ids.actor,
    previousState: null,
    nextState: 'active',
    reasonCode: 'manual_admission',
    detail,
  });
  expect(f.writes[1]?.value).toMatchObject({
    organizationId: ids.organization,
    branchId: ids.branch,
    actorUserId: ids.actor,
    actorRole: 'owner',
    action: 'resident.manual.admitted',
    targetType: 'stay',
    targetId: ids.stay,
    after: { state: 'active', version: 1, ...detail, historyId: ids.history },
  });
  expect(JSON.stringify(f.writes.map((row) => row.value))).not.toContain('Offline resident');
});
it.each([stays, stayAgreements, stayAssignments, inventoryClaims])(
  'ACC-004: required admission record write %# propagates for atomic rollback',
  async (table) => {
    await expect(
      writeManualAdmissionRecords(fixture(table).tx, admissionContext()),
    ).rejects.toThrow('Required admission write failed');
  },
);
it.each([stayHistory, hostelAuditLog])(
  'AUD-004 / ACC-004: required history/audit write %# cannot be ignored',
  async (table) => {
    await expect(
      writeManualAdmissionHistory(fixture(table).tx, admissionContext()),
    ).rejects.toThrow('Required admission write failed');
  },
);
