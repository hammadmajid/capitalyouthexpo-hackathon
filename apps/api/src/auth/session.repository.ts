import { and, eq, inArray, isNull } from 'drizzle-orm';
import { v7 } from 'uuid';
import { NotificationProducer } from '@hsm/notifications';
import {
  sessions,
  users,
  branches,
  brands,
  organizations,
  managerAssignments,
  type Database,
} from '@hsm/db';
import type { NewSession, SessionStore, SessionTransaction } from './session.store.js';
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
class LockedSessions implements SessionTransaction {
  constructor(
    private readonly database: Transaction,
    private readonly userId: string,
    readonly identity: SessionTransaction['identity'],
  ) {}
  list() {
    return this.database.select().from(sessions).where(eq(sessions.userId, this.userId));
  }
  async setPassword(hash: string, now: Date) {
    await this.database
      .update(users)
      .set({ passwordHash: hash, updatedAt: now })
      .where(eq(users.id, this.userId));
    await new NotificationProducer().enqueue(
      this.database,
      {
        userId: this.userId,
        event: 'account.password_changed',
        operationId: v7(),
      },
      now,
    );
  }
  async insert(value: NewSession) {
    await this.database.insert(sessions).values({ ...value, userId: this.userId });
  }
  async rotate(previousId: string, next: NewSession, now: Date) {
    await this.insert(next);
    await this.database
      .update(sessions)
      .set({
        revokedAt: now,
        revokedReason: 'rotated',
        replacedBySessionId: next.id,
        lastUsedAt: now,
      })
      .where(and(eq(sessions.userId, this.userId), eq(sessions.id, previousId)));
  }
  async revoke(ids: readonly string[], reason: string, now: Date) {
    if (ids.length === 0) return;
    await this.database
      .update(sessions)
      .set({ revokedAt: now, revokedReason: reason })
      .where(and(eq(sessions.userId, this.userId), inArray(sessions.id, [...ids])));
  }
}
export class SessionRepository implements SessionStore {
  constructor(private readonly database: Database) {}
  async identify(hash: string) {
    const [row] = await this.database
      .select({ userId: sessions.userId })
      .from(sessions)
      .where(eq(sessions.refreshTokenHash, hash))
      .limit(1);
    return row?.userId;
  }
  transaction<T>(userId: string, work: (transaction: SessionTransaction) => Promise<T>) {
    return this.database.transaction(async (database) => {
      // SEC / MGR-004: all session mutations serialize on the same identity lock.
      const [identity] = await database
        .select({
          id: users.id,
          accountStatus: users.accountStatus,
          passwordHash: users.passwordHash,
          emailVerifiedAt: users.emailVerifiedAt,
        })
        .from(users)
        .where(eq(users.id, userId))
        .for('update');
      const managers = identity
        ? await database
            .select({ id: managerAssignments.id })
            .from(managerAssignments)
            .innerJoin(branches, eq(branches.id, managerAssignments.branchId))
            .innerJoin(brands, eq(brands.id, branches.brandId))
            .innerJoin(organizations, eq(organizations.id, branches.organizationId))
            .where(
              and(
                eq(managerAssignments.userId, userId),
                eq(managerAssignments.status, 'active'),
                isNull(branches.archivedAt),
                isNull(brands.archivedAt),
                isNull(organizations.archivedAt),
              ),
            )
            .limit(1)
        : [];
      return work(
        new LockedSessions(
          database,
          userId,
          identity ? { ...identity, managerActive: managers.length > 0 } : undefined,
        ),
      );
    });
  }
}
