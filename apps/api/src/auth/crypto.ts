import { createHmac, timingSafeEqual } from 'node:crypto';
import { envelopeKey, openEnvelope, sealEnvelope } from '@hsm/security/envelope';
import { argon2id, hash, verify } from 'argon2';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import { DomainError, cnicSchema, passwordSchema } from '@hsm/contracts';

export const authKeysSchema = z
  .object({
    JWT_SECRET: z.string().min(32),
    CNIC_HASH_KEY: z.string().regex(/^[a-f0-9]{64}$/i),
    CNIC_ENCRYPTION_KEY: z.string().regex(/^[a-f0-9]{64}$/i),
  })
  .superRefine((keys, context) => {
    if (keys.CNIC_HASH_KEY.toLowerCase() === keys.CNIC_ENCRYPTION_KEY.toLowerCase())
      context.addIssue({
        code: 'custom',
        path: ['CNIC_ENCRYPTION_KEY'],
        message: 'Independent keys required',
      });
  });
export type AuthKeys = z.infer<typeof authKeysSchema>;
const claimsSchema = z.object({ sub: z.string().uuid(), sid: z.string().uuid() });
const commonPasswords = new Set([
  'password',
  'password1',
  'password123',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty123',
  'qwertyuiop',
  'letmein123',
  'admin123',
  'iloveyou',
  'welcome123',
  'abc12345',
  '00000000',
  '11111111',
  'pakistan',
  'pakistan123',
]);
export function validatePassword(input: string) {
  const password = passwordSchema.parse(input);
  // SEC: reject common passwords independently of character composition.
  if (commonPasswords.has(password.toLowerCase()))
    throw new DomainError('VALIDATION_FAILED', 400, 'Choose a stronger password');
  return password;
}
export async function hashPassword(input: string) {
  return hash(validatePassword(input), {
    type: argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
}
export async function verifyPassword(encoded: string | null, input: string) {
  if (!encoded) return false;
  try {
    return await verify(encoded, input);
  } catch {
    return false;
  }
}
export class AuthCrypto {
  private readonly signingKey;
  private readonly hashingKey;
  private readonly encryptionKey;
  constructor(keys: AuthKeys) {
    const parsed = authKeysSchema.parse(keys);
    this.signingKey = new TextEncoder().encode(parsed.JWT_SECRET);
    this.hashingKey = Buffer.from(parsed.CNIC_HASH_KEY, 'hex');
    this.encryptionKey = Buffer.from(parsed.CNIC_ENCRYPTION_KEY, 'hex');
  }
  digest(
    value: string,
    purpose: 'refresh' | 'otp' | 'csrf' | 'invitation_request' | 'identity_review',
  ) {
    return createHmac('sha256', this.signingKey)
      .update(purpose + ':' + value)
      .digest('hex');
  }
  equals(left: string, right: string) {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  protectCnic(input: string) {
    const normalized = cnicSchema.parse(input);
    return {
      cnicHash: createHmac('sha256', this.hashingKey).update(normalized).digest(),
      cnicEncrypted: this.encrypt(normalized, 'cnic'),
      cnicLast4: normalized.slice(-4),
    };
  }
  encrypt(value: string, purpose: 'cnic' | 'email') {
    return sealEnvelope(value, envelopeKey(this.encryptionKey, purpose), purpose);
  }
  decrypt(envelope: Buffer, purpose: 'cnic' | 'email') {
    return openEnvelope(envelope, envelopeKey(this.encryptionKey, purpose), purpose);
  }
  async access(userId: string, sessionId: string, now: Date) {
    return new SignJWT({ sid: sessionId })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(userId)
      .setIssuer('hsm-api')
      .setAudience('hsm-clients')
      .setIssuedAt(Math.floor(now.getTime() / 1000))
      .setExpirationTime(Math.floor(now.getTime() / 1000) + 600)
      .sign(this.signingKey);
  }
  async claims(token: string, now: Date) {
    try {
      const result = await jwtVerify(token, this.signingKey, {
        algorithms: ['HS256'],
        issuer: 'hsm-api',
        audience: 'hsm-clients',
        currentDate: now,
      });
      return claimsSchema.parse(result.payload);
    } catch {
      throw new DomainError('UNAUTHENTICATED', 401, 'Authentication required');
    }
  }
}
