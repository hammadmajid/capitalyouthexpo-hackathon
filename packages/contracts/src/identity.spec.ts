import { describe, expect, it } from 'vitest';
import {
  registrationSchema,
  cnicSchema,
  loginSchema,
  verifyEmailSchema,
  capabilitiesSchema,
  paginationSchema,
  accountStatusSchema,
  managerStatusSchema,
  adminRoleSchema,
} from './identity.js';
import { DomainError, problemSchema } from './errors.js';
const registration = {
  fullName: 'Test Person',
  email: 'TEST@example.invalid',
  phone: '+923001234567',
  password: 'test-password-42',
  gender: 'male',
  dateOfBirth: '2000-01-01',
  cnic: '12345-1234567-1',
};
describe('AUTH-C-001/004 and SEC-001: shared trust boundaries', () => {
  it('normalizes identity without granting capabilities', () => {
    const parsed = registrationSchema.parse(registration);
    expect(parsed.email).toBe('test@example.invalid');
    expect(parsed.cnic).toBe('1234512345671');
    expect(cnicSchema.parse('1234512345671')).toBe(parsed.cnic);
  });
  it.each([
    { owner: true },
    { gender: 'other' },
    { cnic: 'abc1234512345671' },
    { phone: '03001234567' },
    { password: 'short' },
    { email: 'bad' },
  ])('rejects unknown authority fields and malformed identity %j', (patch) => {
    expect(registrationSchema.safeParse({ ...registration, ...patch }).success).toBe(false);
  });
  it('validates login client, OTP and pagination', () => {
    expect(
      loginSchema.parse({
        identifier: 'test@example.invalid',
        password: 'test-password',
        client: 'web',
      }).client,
    ).toBe('web');
    expect(verifyEmailSchema.parse({ email: 'a@example.invalid', code: '012345' }).code).toBe(
      '012345',
    );
    expect(verifyEmailSchema.safeParse({ email: 'a@example.invalid', code: '12345' }).success).toBe(
      false,
    );
    expect(paginationSchema.parse({})).toEqual({ limit: 20 });
    expect(paginationSchema.parse({ limit: '100' }).limit).toBe(100);
    expect(paginationSchema.safeParse({ limit: 101 }).success).toBe(false);
  });
  it('supports independent roles and validates their statuses', () => {
    const value = {
      customer: true,
      owner: true,
      managerOf: [],
      admin: { isRoot: false, roles: ['support'] },
    };
    expect(capabilitiesSchema.parse(value)).toEqual(value);
    expect(capabilitiesSchema.parse({ ...value, admin: null }).admin).toBeNull();
    expect(accountStatusSchema.parse('suspended')).toBe('suspended');
    expect(managerStatusSchema.parse('deactivated')).toBe('deactivated');
    expect(adminRoleSchema.safeParse('all-access').success).toBe(false);
  });
  it('exposes typed problem errors without internals', () => {
    const error = new DomainError('BRANCH_FORBIDDEN', 403, 'Branch access denied');
    expect(error.name).toBe('DomainError');
    expect(error.code).toBe('BRANCH_FORBIDDEN');
    expect(error.status).toBe(403);
    const problem = {
      type: 'https://example.invalid/errors/forbidden',
      title: error.message,
      detail: error.message,
      code: error.code,
      status: error.status,
      traceId: 'test-request',
      errors: [{ path: 'branchId', code: 'forbidden', message: 'Denied' }],
    };
    expect(problemSchema.parse(problem)).toEqual(problem);
    expect(problemSchema.safeParse({ ...problem, stack: 'private internals' }).success).toBe(false);
  });
});
