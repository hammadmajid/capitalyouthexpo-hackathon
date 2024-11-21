import type { emailOtps, notificationOutbox, users } from '@hsm/db';
export type OtpPurpose = 'signup_verify' | 'password_reset' | 'email_change';
export type OtpIdentity = Pick<
  typeof users.$inferSelect,
  'id' | 'email' | 'emailVerifiedAt' | 'accountStatus' | 'passwordHash'
>;
export type OtpRecord = typeof emailOtps.$inferSelect;
export interface OtpTransaction {
  readonly identity: OtpIdentity | undefined;
  latest(purpose: OtpPurpose): Promise<OtpRecord | undefined>;
  issue(
    row: typeof emailOtps.$inferInsert,
    message: typeof notificationOutbox.$inferInsert,
  ): Promise<void>;
  attempt(id: string, attempts: number): Promise<void>;
  consume(id: string, now: Date): Promise<void>;
  verifyEmail(now: Date): Promise<void>;
  resetPassword(hash: string, now: Date): Promise<void>;
}
export interface OtpStore {
  transaction<T>(email: string, work: (transaction: OtpTransaction) => Promise<T>): Promise<T>;
}
