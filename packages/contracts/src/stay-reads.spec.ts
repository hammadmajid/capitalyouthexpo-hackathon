import { expect, it } from 'vitest';
import {
  stayReadQuerySchema,
  customerStayQuerySchema,
  stayDetailSchema,
  stayPageSchema,
} from './stay-reads.js';
const id = '10000000-0000-4000-8000-000000000001',
  next = '10000000-0000-4000-8000-000000000002';
const row = {
  id,
  branchId: id,
  residentId: id,
  displayName: 'Resident',
  source: 'manual',
  state: 'check_in_ready',
  version: 1,
  moveInDate: '2028-02-01',
  expectedLeaveDate: null,
  checkedInAt: null,
  closedAt: null,
  currentAssignment: null,
};
it('RES-002: private directory validates bounded controlled queries and inclusive date ranges', () => {
  expect(stayReadQuerySchema.parse({})).toEqual({ limit: 20 });
  expect(
    stayReadQuerySchema.parse({ q: '  Name  ', moveInFrom: '2028-02-01', moveInTo: '2028-02-01' }),
  ).toMatchObject({ q: 'Name' });
  expect(
    stayReadQuerySchema.parse({
      expectedLeaveFrom: '2028-02-01',
      expectedLeaveTo: '2028-03-01',
      roomId: id,
      bedId: id,
    }),
  ).toMatchObject({ roomId: id });
  expect(customerStayQuerySchema.parse({ limit: '100', state: 'active' })).toEqual({
    limit: 100,
    state: 'active',
  });
});
it.each([
  { moveInFrom: '2028-03-01', moveInTo: '2028-02-01' },
  { expectedLeaveFrom: '2028-03-01', expectedLeaveTo: '2028-02-01' },
  { limit: 101 },
  { q: 'x'.repeat(101) },
  { q: String.fromCharCode(0) },
  { phone: '+923001234567' },
  { cnic: '1234512345671' },
])('SEC-003: invalid or unapproved search boundary rejects %j', (input) => {
  expect(stayReadQuerySchema.safeParse(input).success).toBe(false);
});
it('RES-001: Customer queries cannot choose another identity, branch or private search', () => {
  for (const input of [{ userId: id }, { branchId: id }, { q: 'Other name' }])
    expect(customerStayQuerySchema.safeParse(input).success).toBe(false);
});
it('RES-002: private DTOs reject contacts in lists, extra documents, invalid origin and mismatched continuation', () => {
  expect(stayPageSchema.parse({ data: [row], nextCursor: null }).data).toHaveLength(1);
  expect(
    stayPageSchema.safeParse({ data: [{ ...row, id: next }, row], nextCursor: null }).success,
  ).toBe(false);
  expect(stayPageSchema.safeParse({ data: [row], nextCursor: next }).success).toBe(false);
  expect(
    stayPageSchema.safeParse({ data: [{ ...row, email: 'secret@example.com' }], nextCursor: null })
      .success,
  ).toBe(false);
  const detail = { ...row, bookingId: null, contact: { phone: null, email: null } };
  expect(stayDetailSchema.parse(detail).bookingId).toBeNull();
  expect(stayDetailSchema.safeParse({ ...detail, bookingId: id }).success).toBe(false);
  expect(stayDetailSchema.safeParse({ ...detail, source: 'booking', bookingId: id }).success).toBe(
    true,
  );
  expect(stayDetailSchema.safeParse({ ...detail, cnicEncrypted: 'private' }).success).toBe(false);
});

it.each(['moveInFrom', 'moveInTo', 'expectedLeaveFrom', 'expectedLeaveTo'])(
  'RES-002: %s rejects ISO year zero before constructing a PostgreSQL date filter',
  (field) => {
    expect(stayReadQuerySchema.safeParse({ [field]: '0000-01-01' }).success).toBe(false);
    expect(stayReadQuerySchema.safeParse({ [field]: '0001-01-01' }).success).toBe(true);
  },
);
