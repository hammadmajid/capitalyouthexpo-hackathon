import type { Database, sessions, users } from '@hsm/db';
export type SessionRecord = typeof sessions.$inferSelect;
export type SessionIdentity = Pick<typeof users.$inferSelect, 'id' | 'accountStatus'> &
  Partial<Pick<typeof users.$inferSelect, 'passwordHash' | 'emailVerifiedAt'>> & {
    managerActive?: boolean;
  };
export type NewSession = Pick<
  SessionRecord,
  'id' | 'refreshTokenHash' | 'client' | 'createdAt' | 'lastUsedAt' | 'expiresAt'
>;
export interface SessionTransaction {
  identity: SessionIdentity | undefined;
  list(): Promise<SessionRecord[]>;
  setPassword(hash: string, now: Date): Promise<void>;
  insert(value: NewSession): Promise<void>;
  rotate(previousId: string, next: NewSession, now: Date): Promise<void>;
  revoke(ids: readonly string[], reason: string, now: Date): Promise<void>;
}
export interface SessionStore {
  identify(hash: string): Promise<string | undefined>;
  transaction<T>(userId: string, work: (transaction: SessionTransaction) => Promise<T>): Promise<T>;
}
export type AuthDatabase = Database;
