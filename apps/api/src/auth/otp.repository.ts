import { and, desc, eq, isNull } from 'drizzle-orm';
import { v7 } from 'uuid';
import { NotificationProducer } from '@hsm/notifications';
import { emailOtps, notificationOutbox, sessions, users, type Database } from '@hsm/db';
import type { OtpPurpose, OtpStore, OtpTransaction } from './otp.store.js';
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export class LockedOtp implements OtpTransaction {
  constructor(
    private readonly database: Transaction,
    readonly identity: OtpTransaction['identity'],
  ) {}
  async latest(purpose: OtpPurpose) {
    if (!this.identity) return undefined;
    const [row] = await this.database
      .select()
      .from(emailOtps)
      .where(and(eq(emailOtps.userId, this.identity.id), eq(emailOtps.purpose, purpose)))
      .orderBy(desc(emailOtps.createdAt), desc(emailOtps.id))
      .limit(1);
    return row;
  }
  async issue(row: typeof emailOtps.$inferInsert, message: typeof notificationOutbox.$inferInsert) {
    await this.database.insert(emailOtps).values(row);
    await this.database.insert(notificationOutbox).values(message);
  }
  async attempt(id: string, attempts: number) {
    await this.database.update(emailOtps).set({ attempts }).where(eq(emailOtps.id, id));
  }
  async consume(id: string, now: Date) {
    await this.database.update(emailOtps).set({ consumedAt: now }).where(eq(emailOtps.id, id));
  }
  async verifyEmail(now: Date) {
    if (!this.identity) return;
    await this.database
      .update(users)
      .set({ emailVerifiedAt: now, updatedAt: now })
      .where(eq(users.id, this.identity.id));
    await new NotificationProducer().enqueue(
      this.database,
      {
        userId: this.identity.id,
        event: 'account.email_verified',
        operationId: v7(),
      },
      now,
    );
  }
  async resetPassword(hash: string, now: Date) {
    if (!this.identity) return;
    await this.database
      .update(users)
      .set({ passwordHash: hash, updatedAt: now })
      .where(eq(users.id, this.identity.id));
    await this.database
      .update(sessions)
      .set({ revokedAt: now, revokedReason: 'password_reset' })
      .where(and(eq(sessions.userId, this.identity.id), isNull(sessions.revokedAt)));
    await new NotificationProducer().enqueue(
      this.database,
      {
        userId: this.identity.id,
        event: 'account.password_reset',
        operationId: v7(),
      },
      now,
    );
  }
}
export class OtpRepository implements OtpStore {
  constructor(private readonly database: Database) {}
  transaction<T>(email: string, work: (transaction: OtpTransaction) => Promise<T>) {
    return this.database.transaction(async (database) => {
      // SEC: serialize OTP and session mutations on the same identity lock.
      const [identity] = await database
        .select({
          id: users.id,
          email: users.email,
          emailVerifiedAt: users.emailVerifiedAt,
          passwordHash: users.passwordHash,
          accountStatus: users.accountStatus,
        })
        .from(users)
        .where(eq(users.email, email))
        .for('update');
      return work(new LockedOtp(database, identity));
    });
  }
}
