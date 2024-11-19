import { expect, it } from 'vitest';
import {
  expectedVacancySchema,
  joinWaitlistSchema,
  staffWaitlistEntrySchema,
  waitlistEntrySchema,
  waitlistQuerySchema,
} from './waitlist.js';
const id = '10000000-0000-4000-8000-000000000001';
const entry = {
  id,
  branchId: id,
  branchName: 'Hostel',
  roomTypeId: null,
  roomTypeName: null,
  expectedVacancyDate: null,
  joinedAt: '2026-10-22T03:00:00Z',
  leftAt: null,
};
it('WAIT-001 / SEC-003: only branch/preference can be submitted; private account and staff identities are never writable', () => {
  expect(joinWaitlistSchema.parse({ branchId: id })).toEqual({ branchId: id });
  expect(joinWaitlistSchema.safeParse({ branchId: id, roomTypeId: id }).success).toBe(true);
  for (const field of ['customerUserId', 'ownerId', 'status', 'leftAt'])
    expect(joinWaitlistSchema.safeParse({ branchId: id, [field]: id }).success).toBe(false);
});
it('WAIT-001: own and staff projections preserve branch/preference consistency and omit contact/account identifiers', () => {
  expect(waitlistEntrySchema.parse(entry)).toEqual(entry);
  expect(staffWaitlistEntrySchema.parse({ ...entry, customerName: 'Customer' }).customerName).toBe(
    'Customer',
  );
  for (const schema of [waitlistEntrySchema, staffWaitlistEntrySchema]) {
    const value =
      schema === staffWaitlistEntrySchema ? { ...entry, customerName: 'Customer' } : entry;
    expect(schema.safeParse({ ...value, roomTypeId: id }).success).toBe(false);
    expect(schema.safeParse({ ...value, customerUserId: id }).success).toBe(false);
    expect(schema.safeParse({ ...value, phone: '+923000000000' }).success).toBe(false);
  }
});
it('WAIT-001: query pagination and local calendar estimates remain strict and bounded', () => {
  expect(waitlistQuerySchema.parse({}).limit).toBe(20);
  for (const value of [{ limit: 0 }, { limit: 101 }, { customerUserId: id }, { branchId: id }])
    expect(waitlistQuerySchema.safeParse(value).success).toBe(false);
  expect(
    expectedVacancySchema.parse({
      branchId: id,
      roomTypeId: id,
      expectedVacancyDate: null,
      version: null,
    }).version,
  ).toBeNull();
  expect(
    expectedVacancySchema.safeParse({
      branchId: id,
      roomTypeId: id,
      expectedVacancyDate: '2026-02-30',
      version: null,
    }).success,
  ).toBe(false);
});
