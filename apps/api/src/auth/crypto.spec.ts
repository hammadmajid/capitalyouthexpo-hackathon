import { randomBytes, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  AuthCrypto,
  authKeysSchema,
  hashPassword,
  validatePassword,
  verifyPassword,
} from './crypto.js';
const keys = () => ({
  JWT_SECRET: randomBytes(48).toString('hex'),
  CNIC_HASH_KEY: randomBytes(32).toString('hex'),
  CNIC_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
});
describe('AUTH-C-004 / SEC: identity and credential cryptography', () => {
  it('rejects absent, weak or reused keys', () => {
    expect(authKeysSchema.safeParse({}).success).toBe(false);
    expect(authKeysSchema.safeParse({ ...keys(), JWT_SECRET: 'weak' }).success).toBe(false);
    const input = keys();
    expect(
      authKeysSchema.safeParse({ ...input, CNIC_HASH_KEY: input.CNIC_ENCRYPTION_KEY }).success,
    ).toBe(false);
  });
  it('SEC: rejects equivalent encryption and HMAC keys regardless of hexadecimal case', () => {
    const input = {
      ...keys(),
      CNIC_HASH_KEY: 'AB'.repeat(32),
      CNIC_ENCRYPTION_KEY: 'ab'.repeat(32),
    };
    expect(Buffer.from(input.CNIC_HASH_KEY, 'hex')).toEqual(
      Buffer.from(input.CNIC_ENCRYPTION_KEY, 'hex'),
    );
    expect(authKeysSchema.safeParse(input).success).toBe(false);
  });
  it('normalizes CNIC, hashes for uniqueness, encrypts and masks at rest', () => {
    const crypto = new AuthCrypto(keys());
    const protectedValue = crypto.protectCnic('35202-1234567-1');
    expect(protectedValue.cnicHash).toHaveLength(32);
    expect(protectedValue.cnicHash).toEqual(crypto.protectCnic('3520212345671').cnicHash);
    expect(protectedValue.cnicLast4).toBe('5671');
    expect(protectedValue.cnicEncrypted.includes(Buffer.from('3520212345671'))).toBe(false);
    expect(crypto.decrypt(protectedValue.cnicEncrypted, 'cnic')).toBe('3520212345671');
    expect(crypto.protectCnic('3520212345671').cnicEncrypted).not.toEqual(
      protectedValue.cnicEncrypted,
    );
  });
  it('detects tampering, wrong keys and cross-purpose decryption', () => {
    const crypto = new AuthCrypto(keys());
    const value = crypto.encrypt('private OTP', 'email');
    expect(crypto.decrypt(value, 'email')).toBe('private OTP');
    expect(() => crypto.decrypt(value, 'cnic')).toThrow();
    expect(() => new AuthCrypto(keys()).decrypt(value, 'email')).toThrow();
    value[value.length - 1] = (value[value.length - 1] ?? 0) ^ 1;
    expect(() => crypto.decrypt(value, 'email')).toThrow();
    expect(() => crypto.decrypt(Buffer.alloc(3), 'email')).toThrow('Invalid protected value');
    expect(() => crypto.decrypt(Buffer.alloc(30), 'email')).toThrow('Invalid protected value');
    expect(() => crypto.protectCnic('invalid')).toThrow();
  });
  it('domain-separates credential hashes and compares safely', () => {
    const crypto = new AuthCrypto(keys());
    const digest = crypto.digest('credential', 'refresh');
    expect(digest).not.toBe(crypto.digest('credential', 'otp'));
    expect(
      new Set(
        ['refresh', 'otp', 'csrf', 'invitation_request'].map((purpose) =>
          crypto.digest('credential', purpose as 'refresh' | 'otp' | 'csrf' | 'invitation_request'),
        ),
      ).size,
    ).toBe(4);
    expect(crypto.equals(digest, digest)).toBe(true);
    expect(crypto.equals(digest, 'short')).toBe(false);
    expect(crypto.equals('abc', 'abd')).toBe(false);
  });
  it('SEC: Argon2id passwords reject common and invalid values', async () => {
    expect(() => validatePassword('password123')).toThrow();
    expect(() => validatePassword('short')).toThrow();
    expect(() => validatePassword('a'.repeat(129))).toThrow();
    const encoded = await hashPassword('Correct horse violet river 928!');
    expect(encoded.startsWith('$argon2id$')).toBe(true);
    expect(encoded).not.toContain('Correct horse');
    expect(await verifyPassword(encoded, 'Correct horse violet river 928!')).toBe(true);
    expect(await verifyPassword(encoded, 'Wrong password')).toBe(false);
    expect(await verifyPassword(null, 'Wrong password')).toBe(false);
    expect(await verifyPassword('malformed hash', 'Wrong password')).toBe(false);
  }, 30000);
  it('SEC: short-lived signed access tokens bind session, issuer and audience', async () => {
    const crypto = new AuthCrypto(keys());
    const user = randomUUID();
    const session = randomUUID();
    const now = new Date('2026-10-07T12:00:00Z');
    const token = await crypto.access(user, session, now);
    expect(await crypto.claims(token, now)).toEqual({ sub: user, sid: session });
    await expect(crypto.claims(token, new Date(now.getTime() + 600000))).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    await expect(crypto.claims(token + 'tampered', now)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    await expect(new AuthCrypto(keys()).claims(token, now)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    await expect(crypto.claims('invalid', now)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});
