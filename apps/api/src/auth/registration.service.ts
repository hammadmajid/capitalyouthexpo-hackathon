import { randomBytes } from 'node:crypto';
import {
  DomainError,
  registrationStartSchema,
  registrationVerifySchema,
  registrationPasswordSchema,
  registrationVerificationResultSchema,
} from '@hsm/contracts';
import type { z } from 'zod';
import { AuthCrypto, hashPassword } from './crypto.js';
import { OtpService } from './otp.service.js';
import type { RegistrationStore } from './registration.store.js';
import type { SessionService } from './session.service.js';
import type { ProfileRepository } from './profile.repository.js';
export class RegistrationService {
  private readonly otp: OtpService;
  constructor(
    private readonly store: RegistrationStore,
    private readonly crypto: AuthCrypto,
    private readonly sessions: Pick<SessionService, 'issue'>,
    private readonly profiles: Pick<ProfileRepository, 'read'>,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.otp = new OtpService(store, crypto, clock);
  }
  private digest(token: string) {
    return this.crypto.digest('registration-password:' + token, 'otp');
  }
  async start(input: z.infer<typeof registrationStartSchema>) {
    const { email } = registrationStartSchema.parse(input),
      now = this.clock();
    await this.store.start(email, now, (transaction) =>
      this.otp.issue(transaction, 'signup_verify', now),
    );
    return { verificationRequired: true as const };
  }
  async verify(input: z.infer<typeof registrationVerifySchema>) {
    const { email, code } = registrationVerifySchema.parse(input);
    const setupToken = randomBytes(32).toString('base64url');
    const outcome: { next: 'password' | 'login' } = { next: 'login' };
    await this.otp.verify(email, code, 'signup_verify', async (transaction, now) => {
      if (!transaction.identity?.emailVerifiedAt) await transaction.verifyEmail(now);
      outcome.next = await this.store.grant(transaction, this.digest(setupToken), now);
    });
    return registrationVerificationResultSchema.parse(
      outcome.next === 'password'
        ? { next: outcome.next, setupToken, expiresIn: 600 }
        : { next: outcome.next },
    );
  }
  async password(input: z.infer<typeof registrationPasswordSchema>) {
    const body = registrationPasswordSchema.parse(input);
    const passwordHash = await hashPassword(body.password);
    const userId = await this.store.complete(
      this.digest(body.setupToken),
      passwordHash,
      this.clock(),
    );
    const credentials = await this.sessions.issue(userId, body.client, (identity) => {
      if (identity.passwordHash !== passwordHash || !identity.emailVerifiedAt)
        throw new DomainError('INVALID_CREDENTIALS', 401, 'Registration setup unavailable');
    });
    return { ...credentials, ...(await this.profiles.read(userId)) };
  }
}
