import { eq, or } from 'drizzle-orm';
import { customerProfiles, users, type Database } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import { LockedOtp } from './otp.repository.js';
import type { IdentityStore } from './identity.store.js';
import type { OtpTransaction } from './otp.store.js';
function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    ('code' in error && error.code === '23505') ||
    (error.cause instanceof Error && 'code' in error.cause && error.cause.code === '23505')
  );
}
export class IdentityRepository implements IdentityStore {
  constructor(private readonly database: Database) {}
  async find(identifier: string) {
    const [row] = await this.database
      .select({
        id: users.id,
        passwordHash: users.passwordHash,
        emailVerifiedAt: users.emailVerifiedAt,
        accountStatus: users.accountStatus,
      })
      .from(users)
      .where(or(eq(users.email, identifier), eq(users.phoneE164, identifier)))
      .limit(1);
    return row;
  }
  async register(
    row: typeof users.$inferInsert,
    work: (transaction: OtpTransaction) => Promise<void>,
  ) {
    if (!row.email || !row.phoneE164 || !row.cnicHash) throw new Error('Incomplete registration');
    const email = row.email;
    const phone = row.phoneE164;
    const cnicHash = row.cnicHash;
    try {
      await this.database.transaction(async (database) => {
        const [duplicate] = await database
          .select({ accountStatus: users.accountStatus })
          .from(users)
          .where(
            or(eq(users.email, email), eq(users.phoneE164, phone), eq(users.cnicHash, cnicHash)),
          )
          .limit(1);
        if (duplicate)
          throw new DomainError(
            duplicate.accountStatus === 'unclaimed'
              ? 'IDENTITY_EXISTS_CLAIM_REQUIRED'
              : 'IDENTITY_EXISTS',
            409,
            'Identity already exists',
          );
        const [identity] = await database.insert(users).values(row).returning({
          id: users.id,
          email: users.email,
          emailVerifiedAt: users.emailVerifiedAt,
          passwordHash: users.passwordHash,
          accountStatus: users.accountStatus,
        });
        if (!identity) throw new Error('Registration unavailable');
        await database.insert(customerProfiles).values({ userId: identity.id });
        await work(new LockedOtp(database, identity));
      });
    } catch (error) {
      // SEC: concurrent uniqueness conflicts must not expose SQL or identity fields.
      if (isUniqueViolation(error))
        throw new DomainError('IDENTITY_EXISTS', 409, 'Identity already exists');
      throw error;
    }
  }
}
