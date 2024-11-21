import type { users } from '@hsm/db';
import type { OtpTransaction } from './otp.store.js';
export type LoginIdentity = Pick<
  typeof users.$inferSelect,
  'id' | 'passwordHash' | 'emailVerifiedAt' | 'accountStatus'
>;
export interface IdentityStore {
  find(identifier: string): Promise<LoginIdentity | undefined>;
  register(
    row: typeof users.$inferInsert,
    work: (transaction: OtpTransaction) => Promise<void>,
  ): Promise<void>;
}
