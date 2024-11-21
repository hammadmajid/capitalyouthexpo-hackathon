import { and, eq, isNull } from 'drizzle-orm';
import { registrationSetups, users, type Database } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import { LockedOtp } from './otp.repository.js';
import type { OtpTransaction } from './otp.store.js';
import type { RegistrationStore } from './registration.store.js';
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
const unavailable = () =>
  new DomainError('INVALID_CREDENTIALS', 401, 'Registration setup unavailable');
class LockedRegistration extends LockedOtp {
  constructor(
    private readonly transaction: Transaction,
    identity: OtpTransaction['identity'],
  ) {
    super(transaction, identity);
  }
  async grant(tokenHash: string, now: Date): Promise<'password' | 'login'> {
    const identity = this.identity;
    if (!identity || identity.accountStatus !== 'active') throw unavailable();
    // AUTH-C: signup proof never resets an existing permanent credential.
    if (identity.passwordHash !== null) return 'login';
    await this.transaction
      .update(registrationSetups)
      .set({ consumedAt: now })
      .where(
        and(eq(registrationSetups.userId, identity.id), isNull(registrationSetups.consumedAt)),
      );
    await this.transaction.insert(registrationSetups).values({
      userId: identity.id,
      tokenHash,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 600000),
    });
    return 'password';
  }
}
export class RegistrationRepository implements RegistrationStore {
  constructor(private readonly database: Database) {}
  private async locked<T>(
    database: Transaction,
    email: string,
    work: (value: OtpTransaction) => Promise<T>,
  ) {
    const [identity] = await database
      .select({
        id: users.id,
        email: users.email,
        emailVerifiedAt: users.emailVerifiedAt,
        accountStatus: users.accountStatus,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.email, email))
      .for('update');
    return work(new LockedRegistration(database, identity));
  }
  transaction<T>(email: string, work: (transaction: OtpTransaction) => Promise<T>) {
    return this.database.transaction((database) => this.locked(database, email, work));
  }
  start(email: string, now: Date, work: (transaction: OtpTransaction) => Promise<void>) {
    return this.database.transaction(async (database) => {
      await database
        .insert(users)
        .values({ fullName: '', email, createdAt: now, updatedAt: now })
        .onConflictDoNothing({ target: users.email });
      await this.locked(database, email, work);
    });
  }
  grant(transaction: OtpTransaction, tokenHash: string, now: Date) {
    if (!(transaction instanceof LockedRegistration))
      throw new Error('Invalid registration transaction');
    return transaction.grant(tokenHash, now);
  }
  complete(tokenHash: string, passwordHash: string, now: Date) {
    return this.database.transaction(async (database) => {
      const [reference] = await database
        .select({ userId: registrationSetups.userId })
        .from(registrationSetups)
        .where(eq(registrationSetups.tokenHash, tokenHash))
        .limit(1);
      if (!reference) throw unavailable();
      // SEC: lock identity before grant, matching OTP/session/recovery lock order.
      const [identity] = await database
        .select()
        .from(users)
        .where(eq(users.id, reference.userId))
        .for('update');
      const [grant] = await database
        .select()
        .from(registrationSetups)
        .where(
          and(
            eq(registrationSetups.tokenHash, tokenHash),
            eq(registrationSetups.userId, reference.userId),
          ),
        )
        .for('update');
      if (
        !identity ||
        identity.accountStatus !== 'active' ||
        !identity.emailVerifiedAt ||
        identity.passwordHash !== null ||
        !grant ||
        grant.consumedAt ||
        grant.expiresAt <= now
      )
        throw unavailable();
      await database
        .update(users)
        .set({ passwordHash, updatedAt: now })
        .where(eq(users.id, identity.id));
      await database
        .update(registrationSetups)
        .set({ consumedAt: now })
        .where(
          and(eq(registrationSetups.userId, identity.id), isNull(registrationSetups.consumedAt)),
        );
      return identity.id;
    });
  }
}
