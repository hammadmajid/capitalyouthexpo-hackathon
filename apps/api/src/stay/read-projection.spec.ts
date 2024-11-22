import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { stayReadRow } from '../../test/unit/stay-read.fixture.js';
import { projectStay, projectStayDetail } from './read-projection.js';
it('RES-002 / SEC-003: list omits contacts, login identity, internal actor/reason and document/finance data', () => {
  const row = stayReadRow(),
    summary = projectStay(row),
    detail = projectStayDetail(row);
  expect(summary).toMatchObject({
    displayName: row.resident.displayName,
    currentAssignment: { bedId: row.assignment?.seatId },
  });
  expect(summary).not.toHaveProperty('userId');
  expect(summary).not.toHaveProperty('contact');
  expect(JSON.stringify(summary)).not.toContain(row.resident.email);
  expect(JSON.stringify(detail)).not.toContain('Private historical reason');
  expect(detail.contact).toEqual({ phone: row.resident.phone, email: row.resident.email });
  expect(detail.bookingId).toBeNull();
});
it('STAY-001: retained booking source, absent assignment, actual timestamps and planned departure remain distinct', () => {
  const row = stayReadRow();
  row.stay = {
    ...row.stay,
    state: 'completed',
    source: 'booking',
    bookingId: randomUUID(),
    expectedLeaveDate: '2028-03-01',
    closedAt: new Date('2028-03-02T06:00:00.000Z'),
  };
  row.assignment = null;
  expect(projectStayDetail(row)).toMatchObject({
    currentAssignment: null,
    expectedLeaveDate: '2028-03-01',
    closedAt: row.stay.closedAt?.toISOString(),
    bookingId: row.stay.bookingId,
  });
  row.stay.state = 'check_in_ready';
  row.stay.checkedInAt = null;
  row.stay.closedAt = null;
  row.resident.phone = null;
  row.resident.email = null;
  expect(projectStayDetail(row)).toMatchObject({
    checkedInAt: null,
    closedAt: null,
    contact: { phone: null, email: null },
  });
});
it.each([
  'resident',
  'residentBranch',
  'stay',
  'assignmentBranch',
  'ended',
  'date',
  'shape',
  'origin',
  'contact',
])('ACC-004 / SEC-003: malformed %s private record fails closed', (kind) => {
  const row = stayReadRow();
  if (kind === 'resident') row.resident.id = randomUUID();
  if (kind === 'residentBranch') row.resident.branchId = randomUUID();
  if (row.assignment) {
    if (kind === 'stay') row.assignment.stayId = randomUUID();
    if (kind === 'assignmentBranch') row.assignment.branchId = randomUUID();
    if (kind === 'ended') row.assignment.endedAt = new Date();
    if (kind === 'date') row.assignment.startedAt = new Date('invalid');
  }
  if (kind === 'shape') row.stay.version = 0;
  if (kind === 'origin') row.stay.source = 'booking';
  if (kind === 'contact') row.resident.email = 'invalid';
  expect(() => projectStayDetail(row)).toThrow('Stay data unavailable');
});
