import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  stayAdmissionResultSchema,
  stayPreparationResultSchema,
  stayCommandResultSchema,
} from './stay-responses.js';
const base = { id: randomUUID(), branchId: randomUUID(), version: 1 };
const preparation = {
  ...base,
  state: 'check_in_ready',
  residentId: randomUUID(),
  agreementId: randomUUID(),
};
const admission = {
  ...preparation,
  state: 'active',
  assignmentId: randomUUID(),
  invoiceIds: [randomUUID()],
};
it('STAY-001 / ACC-004: prepared and admitted responses retain exact canonical scope without occupant/private document fields', () => {
  expect(stayPreparationResultSchema.parse(preparation)).toEqual(preparation);
  expect(
    stayAdmissionResultSchema.parse({ ...admission, branchId: admission.branchId.toUpperCase() }),
  ).toEqual(admission);
  expect(stayAdmissionResultSchema.parse({ ...admission, invoiceIds: [] }).invoiceIds).toEqual([]);
  expect(stayCommandResultSchema.parse({ ...base, state: 'completed', version: 2 })).toMatchObject({
    state: 'completed',
    version: 2,
  });
});
it.each([
  { ...admission, state: 'check_in_ready' },
  { ...admission, version: 0 },
  { ...admission, invoiceIds: [base.id, base.id] },
  { ...admission, invoiceIds: Array.from({ length: 34 }, () => randomUUID()) },
  { ...admission, customerCnic: 'private' },
  { ...admission, branchId: 'invalid' },
])('STAY-001 / ACC-002: unsafe/inconsistent command result %j is rejected', (value) => {
  expect(stayAdmissionResultSchema.safeParse(value).success).toBe(false);
});
