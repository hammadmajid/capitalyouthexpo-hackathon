import { v7 } from 'uuid';
import {
  DomainError,
  isAdult,
  normalizeLoginIdentifier,
  type registrationSchema,
  type loginSchema,
} from '@hsm/contracts';
import type { z } from 'zod';
import { AuthCrypto, hashPassword, verifyPassword } from './crypto.js';
import type { IdentityStore } from './identity.store.js';
import type { OtpService } from './otp.service.js';
import type { SessionService } from './session.service.js';
import type { ProfileRepository } from './profile.repository.js';
import { requireActiveAccount } from './session.policy.js';
export class IdentityService {
  constructor(
    private readonly store: IdentityStore,
    private readonly sessions: SessionService,
    private readonly otp: OtpService,
    private readonly crypto: AuthCrypto,
    private readonly profiles: Pick<ProfileRepository, 'read'>,
    private readonly dummyHash: string,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async register(input: z.infer<typeof registrationSchema>) {
    const now = this.clock();
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    if (!isAdult(input.dateOfBirth, today))
      throw new DomainError('UNDERAGE', 422, 'An adult identity is required');
    const passwordHash = await hashPassword(input.password);
    await this.store.register(
      {
        id: v7(),
        fullName: input.fullName,
        email: input.email,
        phoneE164: input.phone,
        gender: input.gender,
        dateOfBirth: input.dateOfBirth,
        ...this.crypto.protectCnic(input.cnic),
        passwordHash,
        createdAt: now,
        updatedAt: now,
      },
      (transaction) => this.otp.issue(transaction, 'signup_verify', now),
    );
    return { verificationRequired: true };
  }
  async login(input: z.infer<typeof loginSchema>) {
    const row = await this.store.find(normalizeLoginIdentifier(input.identifier));
    // SEC: unknown identities still incur the same Argon2id verification work.
    const valid = await verifyPassword(row?.passwordHash ?? this.dummyHash, input.password);
    if (!valid || !row?.passwordHash)
      throw new DomainError('INVALID_CREDENTIALS', 401, 'Invalid credentials');
    requireActiveAccount(row.accountStatus);
    const credentials = await this.sessions.issue(row.id, input.client, (identity) => {
      // SEC: reset/change must win against a stale password verification.
      if (identity.passwordHash !== row.passwordHash)
        throw new DomainError('INVALID_CREDENTIALS', 401, 'Invalid credentials');
      if (!identity.emailVerifiedAt && !identity.managerActive)
        throw new DomainError('EMAIL_NOT_VERIFIED', 403, 'Email verification required');
    });
    return { ...credentials, ...(await this.profiles.read(row.id)) };
  }
  async verifyEmail(email: string, code: string, client: 'web' | 'mobile') {
    const userId = await this.otp.verifyEmail(email, code);
    return {
      ...(await this.sessions.issue(userId, client, (identity) => {
        if (!identity.passwordHash || !identity.emailVerifiedAt)
          throw new DomainError('INVALID_CREDENTIALS', 401, 'Permanent credentials required');
      })),
      ...(await this.profiles.read(userId)),
    };
  }
  async resetPassword(email: string, code: string, password: string) {
    await this.otp.resetPassword(email, code, await hashPassword(password));
    return { reset: true };
  }
}
