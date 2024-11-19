import { z } from 'zod';
import {
  staffAgreementFileSchema,
  staffAgreementInputSchema,
  staffAgreementSchema,
  staffCreateInputSchema,
  staffDashboardSchema,
  staffDetailSchema,
  staffIssueInputSchema,
  staffMemberSchema,
  staffMonthQuerySchema,
  staffPageSchema,
  staffPaymentInputSchema,
  staffQuerySchema,
  staffReversalInputSchema,
  staffSalarySchema,
  staffSalaryTermsInputSchema,
  staffStatusInputSchema,
  staffTermsSchema,
  staffUpdateInputSchema,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
// CHG-039: staff directory and record-only salary tracking. Every response must belong to the
// branch it was requested for.
const id = (value: unknown) => z.string().uuid().parse(value).toLowerCase();
const header = (key: string) => ({ 'Idempotency-Key': id(key) });
function sameBranch<T extends { branchId: string }>(value: T, branchId: string) {
  if (value.branchId !== branchId) throw new ClientFailure('INVALID_RESPONSE');
  return value;
}
function defined<T extends object>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}
export async function listStaff(client: ApiClient, branch: unknown, query: unknown = {}) {
  const branchId = id(branch);
  const page = await readApi(
    client.GET('/v1/branches/{branchId}/staff', {
      params: { path: { branchId }, query: defined(staffQuerySchema.parse(query)) as never },
    }),
    staffPageSchema,
  );
  for (const row of page.data) sameBranch(row, branchId);
  return page;
}
export async function readStaffDashboard(client: ApiClient, branch: unknown, query: unknown = {}) {
  const branchId = id(branch);
  return sameBranch(
    await readApi(
      client.GET('/v1/branches/{branchId}/staff-dashboard', {
        params: { path: { branchId }, query: defined(staffMonthQuerySchema.parse(query)) as never },
      }),
      staffDashboardSchema,
    ),
    branchId,
  );
}
export async function readStaff(client: ApiClient, branch: unknown, staff: unknown) {
  const branchId = id(branch);
  const detail = await readApi(
    client.GET('/v1/branches/{branchId}/staff/{staffId}', {
      params: { path: { branchId, staffId: id(staff) } },
    }),
    staffDetailSchema,
  );
  sameBranch(detail.staff, branchId);
  return detail;
}
export async function createStaff(client: ApiClient, branch: unknown, input: unknown, key: string) {
  const branchId = id(branch);
  return sameBranch(
    await readApi(
      client.POST('/v1/branches/{branchId}/staff', {
        params: { path: { branchId }, header: header(key) },
        body: staffCreateInputSchema.parse(input) as never,
      }),
      staffMemberSchema,
    ),
    branchId,
  );
}
export async function updateStaff(
  client: ApiClient,
  branch: unknown,
  staff: unknown,
  input: unknown,
  key: string,
) {
  const branchId = id(branch);
  return sameBranch(
    await readApi(
      client.PATCH('/v1/branches/{branchId}/staff/{staffId}', {
        params: { path: { branchId, staffId: id(staff) }, header: header(key) },
        body: staffUpdateInputSchema.parse(input) as never,
      }),
      staffMemberSchema,
    ),
    branchId,
  );
}
export async function setStaffStatus(
  client: ApiClient,
  branch: unknown,
  staff: unknown,
  input: unknown,
  key: string,
) {
  const branchId = id(branch);
  return sameBranch(
    await readApi(
      client.POST('/v1/branches/{branchId}/staff/{staffId}/status', {
        params: { path: { branchId, staffId: id(staff) }, header: header(key) },
        body: staffStatusInputSchema.parse(input) as never,
      }),
      staffMemberSchema,
    ),
    branchId,
  );
}
export async function setStaffSalaryTerms(
  client: ApiClient,
  branch: unknown,
  staff: unknown,
  input: unknown,
  key: string,
) {
  return readApi(
    client.POST('/v1/branches/{branchId}/staff/{staffId}/salary-terms', {
      params: { path: { branchId: id(branch), staffId: id(staff) }, header: header(key) },
      body: staffSalaryTermsInputSchema.parse(input) as never,
    }),
    staffTermsSchema,
  );
}
export async function issueStaffSalary(
  client: ApiClient,
  branch: unknown,
  staff: unknown,
  input: unknown,
  key: string,
) {
  return readApi(
    client.POST('/v1/branches/{branchId}/staff/{staffId}/salaries', {
      params: { path: { branchId: id(branch), staffId: id(staff) }, header: header(key) },
      body: staffIssueInputSchema.parse(input) as never,
    }),
    staffSalarySchema,
  );
}
export async function recordStaffPayment(
  client: ApiClient,
  branch: unknown,
  salary: unknown,
  input: unknown,
  key: string,
) {
  const salaryId = id(salary);
  const result = await readApi(
    client.POST('/v1/branches/{branchId}/staff-salaries/{salaryId}/payments', {
      params: { path: { branchId: id(branch), salaryId }, header: header(key) },
      body: staffPaymentInputSchema.parse(input) as never,
    }),
    staffSalarySchema,
  );
  if (result.id !== salaryId) throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export async function reverseStaffPayment(
  client: ApiClient,
  branch: unknown,
  payment: unknown,
  input: unknown,
  key: string,
) {
  return readApi(
    client.POST('/v1/branches/{branchId}/staff-payments/{paymentId}/reversal', {
      params: { path: { branchId: id(branch), paymentId: id(payment) }, header: header(key) },
      body: staffReversalInputSchema.parse(input) as never,
    }),
    staffSalarySchema,
  );
}
export async function createStaffAgreement(
  client: ApiClient,
  branch: unknown,
  staff: unknown,
  input: unknown,
  key: string,
) {
  return readApi(
    client.POST('/v1/branches/{branchId}/staff/{staffId}/agreements', {
      params: { path: { branchId: id(branch), staffId: id(staff) }, header: header(key) },
      body: staffAgreementInputSchema.parse(input) as never,
    }),
    staffAgreementSchema,
  );
}
export async function staffAgreementFile(client: ApiClient, branch: unknown, agreement: unknown) {
  return readApi(
    client.GET('/v1/branches/{branchId}/staff-agreements/{agreementId}/file', {
      params: { path: { branchId: id(branch), agreementId: id(agreement) } },
    }),
    staffAgreementFileSchema,
  );
}
