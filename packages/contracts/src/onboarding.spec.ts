import { describe, expect, it } from 'vitest';
import { normalizeLoginIdentifier, pakistaniMobileSchema } from './phone.js';
import {
  customerProfileInputSchema,
  initialExperienceSchema,
  managerInvitationInputSchema,
  ownerProfileInputSchema,
  registrationStartSchema,
  registrationVerifySchema,
  registrationPasswordSchema,
  registrationVerificationResultSchema,
} from './onboarding.js';
const customer = { fullName: 'Example Person', phone: '03001234567', age: 18, gender: 'male' };
const owner = {
  fullName: 'Example Owner',
  phone: '923001234567',
  cnic: '12345-1234567-1',
  cnicFrontFileId: '00000000-0000-4000-8000-000000000001',
  cnicBackFileId: '00000000-0000-4000-8000-000000000002',
  address: 'Example private address',
  agreementAccepted: true,
  agreementVersion: 'owner-foundation-v1',
};
describe('AUTH-C-001 / CHG-006: revised product boundaries', () => {
  it.each(['03001234567', '923001234567', '+923001234567', ' 03001234567 '])(
    'normalizes %s without verification',
    (value) => {
      expect(pakistaniMobileSchema.parse(value)).toBe('+923001234567');
      expect(normalizeLoginIdentifier(value)).toBe('+923001234567');
    },
  );
  it.each([
    '+921234567890',
    '+13001234567',
    '0300123456',
    '030012345678',
    'abc',
    '+92 3001234567',
    '0300-1234567',
  ])('rejects invalid identifiers %s', (value) => {
    expect(pakistaniMobileSchema.safeParse(value).success).toBe(false);
    expect(() => normalizeLoginIdentifier(value)).toThrow();
  });
  it('normalizes email login', () =>
    expect(normalizeLoginIdentifier(' Test@Example.test ')).toBe('test@example.test'));
  it('requires email first and excludes old signup fields', () => {
    expect(registrationStartSchema.parse({ email: 'Example@Example.test' })).toEqual({
      email: 'example@example.test',
    });
    expect(
      registrationStartSchema.safeParse({
        email: 'example@example.test',
        password: 'private-password',
      }).success,
    ).toBe(false);
    expect(
      registrationVerifySchema.safeParse({ email: 'example@example.test', code: '123456' }).success,
    ).toBe(true);
    expect(
      registrationPasswordSchema.safeParse({
        setupToken: 'a'.repeat(32),
        password: 'secure-password',
        client: 'mobile',
      }).success,
    ).toBe(true);
    expect(
      registrationPasswordSchema.safeParse({ password: 'secure-password', client: 'mobile' })
        .success,
    ).toBe(false);
  });
  it('accepts editable customer age without CNIC or DOB', () => {
    expect(customerProfileInputSchema.parse(customer).phone).toBe('+923001234567');
    expect(
      customerProfileInputSchema.safeParse({
        ...customer,
        age: 120,
        institution: 'Example Institute',
      }).success,
    ).toBe(true);
  });
  it.each([
    { age: 17 },
    { age: 121 },
    { age: 18.5 },
    { age: '18' },
    { dateOfBirth: '2000-01-01' },
    { cnic: '1234512345671' },
    { emergencyContact: 'private' },
    { phoneVerified: true },
    { email: 'other@example.test' },
  ])('rejects invalid or unauthorized profile fields %j', (extra) => {
    expect(customerProfileInputSchema.safeParse({ ...customer, ...extra }).success).toBe(false);
  });
  it('requires distinct owner documents and explicit agreement', () => {
    expect(ownerProfileInputSchema.parse(owner).cnic).toBe('1234512345671');
    expect(
      ownerProfileInputSchema.safeParse({
        ...owner,
        cnicFrontFileId: undefined,
        cnicBackFileId: undefined,
      }).success,
    ).toBe(true);
    expect(
      ownerProfileInputSchema.safeParse({ ...owner, cnicBackFileId: owner.cnicFrontFileId })
        .success,
    ).toBe(false);
    expect(ownerProfileInputSchema.safeParse({ ...owner, agreementAccepted: false }).success).toBe(
      false,
    );
    expect(
      ownerProfileInputSchema.safeParse({ ...owner, agreementVersion: 'unknown' }).success,
    ).toBe(false);
    expect(ownerProfileInputSchema.safeParse({ ...owner, bankAccount: 'private' }).success).toBe(
      false,
    );
  });
  it('accepts only the initial additive experience choices', () => {
    for (const experience of ['customer', 'owner'])
      expect(initialExperienceSchema.safeParse({ experience }).success).toBe(true);
    expect(initialExperienceSchema.safeParse({ experience: 'admin' }).success).toBe(false);
  });
  it('defines generated/manual invitations without accepting branch ownership claims', () => {
    const base = { fullName: 'Example Manager', phone: '03001234567' };
    for (const temporaryCredential of [
      { mode: 'auto' },
      { mode: 'manual', password: 'secure-password' },
    ]) {
      expect(managerInvitationInputSchema.safeParse({ ...base, temporaryCredential }).success).toBe(
        true,
      );
    }
    expect(
      managerInvitationInputSchema.safeParse({
        ...base,
        temporaryCredential: { mode: 'manual', password: 'short' },
      }).success,
    ).toBe(false);
    expect(
      managerInvitationInputSchema.safeParse({
        ...base,
        temporaryCredential: { mode: 'auto', password: 'private-password' },
      }).success,
    ).toBe(false);
    expect(
      managerInvitationInputSchema.safeParse({
        ...base,
        temporaryCredential: { mode: 'auto' },
        ownerUserId: owner.cnicFrontFileId,
      }).success,
    ).toBe(false);
  });
});

describe('AUTH-C / CHG-006: verification is a bounded password-setup result', () => {
  const grant = { next: 'password', setupToken: 'a'.repeat(43), expiresIn: 600 };
  it('accepts only password setup or existing-identity login continuation', () => {
    expect(registrationVerificationResultSchema.parse(grant)).toEqual(grant);
    expect(registrationVerificationResultSchema.parse({ next: 'login' })).toEqual({
      next: 'login',
    });
    expect(
      registrationVerificationResultSchema.safeParse({ ...grant, expiresIn: 599 }).success,
    ).toBe(false);
  });
  it.each(['a'.repeat(32), 'a'.repeat(44), '.'.repeat(43), '/'.repeat(43)])(
    'rejects non-issued setup token shape %#',
    (setupToken) =>
      expect(registrationVerificationResultSchema.safeParse({ ...grant, setupToken }).success).toBe(
        false,
      ),
  );
  it.each(['accessToken', 'refreshToken', 'userId'])(
    'rejects %s disclosure or accidental normal-session response at verification',
    (field) => {
      expect(
        registrationVerificationResultSchema.safeParse({ ...grant, [field]: 'private' }).success,
      ).toBe(false);
      expect(
        registrationVerificationResultSchema.safeParse({ next: 'login', [field]: 'private' })
          .success,
      ).toBe(false);
    },
  );
});
