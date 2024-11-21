import { randomInt } from 'node:crypto';
import { v7 } from 'uuid';
import { DomainError } from '@hsm/contracts';
import type { AuthCrypto } from './crypto.js';
import type { OtpPurpose, OtpStore, OtpTransaction } from './otp.store.js';
export class OtpService {
  constructor(
    private readonly store: OtpStore,
    private readonly crypto: AuthCrypto,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  private digest(userId: string, purpose: OtpPurpose, code: string) {
    return this.crypto.digest(purpose + ':' + userId + ':' + code, 'otp');
  }
  matches(userId: string, purpose: OtpPurpose, code: string, hash: string) {
    return this.crypto.equals(hash, this.digest(userId, purpose, code));
  }
  async request(email: string, purpose: OtpPurpose) {
    const now = this.clock();
    await this.store.transaction(email, async (transaction) => {
      await this.issue(transaction, purpose, now);
    });
  }
  async issue(
    transaction: OtpTransaction,
    purpose: OtpPurpose,
    now: Date,
    recipientEmail?: string,
  ) {
    const user = transaction.identity,
      email = recipientEmail ?? user?.email;
    if (!user || user.accountStatus !== 'active' || !email) return;
    if (recipientEmail !== undefined && purpose !== 'email_change')
      throw new DomainError('FORBIDDEN', 403, 'Verification unavailable');
    if (purpose === 'signup_verify' && user.emailVerifiedAt && user.passwordHash) return;
    if (purpose === 'password_reset' && (!user.emailVerifiedAt || !user.passwordHash)) return;
    const previous = await transaction.latest(purpose);
    // ADR 0002: cooldown and unknown identities have the same public acknowledgement.
    if (previous && now.getTime() - previous.createdAt.getTime() < 60000) return;
    const id = v7();
    const code = randomInt(0, 1000000).toString().padStart(6, '0');
    const expiresAt = new Date(now.getTime() + 600000);
    const envelope = this.crypto
      .encrypt(
        JSON.stringify({
          email,
          code,
          purpose,
          expiresAt: expiresAt.toISOString(),
        }),
        'email',
      )
      .toString('base64');
    await transaction.issue(
      {
        id,
        userId: user.id,
        email,
        purpose,
        codeHash: this.digest(user.id, purpose, code),
        createdAt: now,
        expiresAt,
      },
      {
        eventType: 'auth.otp',
        channel: 'email',
        recipientUserId: user.id,
        recipientAddress: email,
        payload: { envelope },
        dedupeKey: 'otp:' + id,
        createdAt: now,
        nextAttemptAt: now,
      },
    );
  }
  async verify(
    email: string,
    code: string,
    purpose: OtpPurpose,
    action: (transaction: OtpTransaction, now: Date) => Promise<void>,
  ) {
    const now = this.clock();
    const userId = await this.store.transaction(email, async (transaction) => {
      const user = transaction.identity;
      if (!user || user.accountStatus !== 'active') return undefined;
      if (purpose === 'password_reset' && (!user.emailVerifiedAt || !user.passwordHash))
        return undefined;
      const row = await transaction.latest(purpose);
      if (!row || row.consumedAt || row.expiresAt <= now || row.attempts >= 5) return undefined;
      await transaction.attempt(row.id, row.attempts + 1);
      if (!this.matches(user.id, purpose, code, row.codeHash)) return undefined;
      await transaction.consume(row.id, now);
      await action(transaction, now);
      return user.id;
    });
    // SEC: failed attempts must commit; throwing inside the transaction would erase them.
    if (!userId) throw new DomainError('INVALID_CREDENTIALS', 401, 'Verification unavailable');
    return userId;
  }
  verifyEmail(email: string, code: string) {
    return this.verify(email, code, 'signup_verify', (transaction, now) =>
      transaction.verifyEmail(now),
    );
  }
  resetPassword(email: string, code: string, hash: string) {
    return this.verify(email, code, 'password_reset', (transaction, now) =>
      transaction.resetPassword(hash, now),
    );
  }
}
