import { and, asc, eq, gt, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import { adminAccounts, adminRoleGrants, users, type Database } from '@hsm/db';
import {
  DomainError,
  adminAccountListSchema,
  adminListQuerySchema,
  adminAccountSchema,
  adminChangeInputSchema,
  adminInviteInputSchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import { requireTransaction } from '../idempotency/context.js';
import type { IdempotencyService } from '../idempotency/service.js';
import { IdempotencyRepository } from '../idempotency/repository.js';
import { lockActor } from '../auth/actor-lock.js';
import { inventoryFailure } from '../booking/errors.js';
import { lockAdmin, lockRootChanges, platformAudit, type AdminRole } from './scope.js';
const id = stayIdentifierSchema;
function conflict(message: string): never {
  throw new DomainError('CONFLICT', 409, message);
}
async function account(tx: Pick<Transaction, 'select'>, userId: string) {
  const [row] = await tx
    .select({
      userId: adminAccounts.userId,
      fullName: users.fullName,
      isRoot: adminAccounts.isRoot,
      status: adminAccounts.status,
    })
    .from(adminAccounts)
    .innerJoin(users, eq(users.id, adminAccounts.userId))
    .where(eq(adminAccounts.userId, userId));
  if (!row) throw new DomainError('NOT_FOUND', 404, 'Admin unavailable');
  const grants = await tx
    .select({ role: adminRoleGrants.role })
    .from(adminRoleGrants)
    .where(and(eq(adminRoleGrants.adminUserId, userId), isNull(adminRoleGrants.revokedAt)));
  return adminAccountSchema.parse({
    ...row,
    roles: grants
      .map((grant) => grant.role)
      .filter((role) => role !== 'billing')
      .sort(),
  });
}
async function activeRoots(tx: Pick<Transaction, 'select'>) {
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(adminAccounts)
    .where(and(eq(adminAccounts.isRoot, true), eq(adminAccounts.status, 'active')));
  return row?.count ?? 0;
}
// ADM-001..006: only a Root Admin manages admins; Root membership stays between one and three.
// Phone possession, Support role or Normal Admin roles never confer Root authority.
export class AdminAccountService {
  private readonly rootCommands: IdempotencyService;
  constructor(
    private readonly database: Database,
    private readonly idempotency: IdempotencyService,
    private readonly clock: () => Date = () => new Date(),
  ) {
    // AUD-015 / ADM-001: cross-demotions must serialize before either actor's
    // identity/admin locks. Taking the membership lock only inside work creates
    // a cycle between the waiting actor's share lock and the winner's target row.
    this.rootCommands = idempotency.withStore(
      new IdempotencyRepository(database, async (tx, actor, now) => {
        await lockRootChanges(tx);
        await lockActor(tx, actor, () => now);
      }),
    );
  }
  list(actor: Actor, query: unknown = {}) {
    const input = adminListQuerySchema.parse(query);
    return this.database.transaction(async (tx) => {
      await lockAdmin(tx, actor, 'root', this.clock);
      // ADM-001: UUID keyset order is deterministic, indexed and independent of timestamp ties.
      const rows = await tx
        .select({ userId: adminAccounts.userId })
        .from(adminAccounts)
        .where(input.cursor ? gt(adminAccounts.userId, input.cursor) : undefined)
        .orderBy(asc(adminAccounts.userId))
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      const data = [];
      for (const row of page) data.push(await account(tx, row.userId));
      const [summary] = await tx
        .select({
          totalCount: sql<number>`count(*)::int`,
          activeRootCount: sql<number>`count(*) filter (where ${adminAccounts.isRoot} and ${adminAccounts.status} = 'active')::int`,
        })
        .from(adminAccounts);
      return adminAccountListSchema.parse({
        data,
        ...summary,
        nextCursor: rows.length > input.limit ? (page.at(-1)?.userId ?? null) : null,
      });
    });
  }
  detail(actor: Actor, userId: unknown) {
    const target = id.parse(userId);
    return this.database.transaction(async (tx) => {
      await lockAdmin(tx, actor, 'root', this.clock);
      return account(tx, target);
    });
  }
  me(actor: Actor) {
    return this.database.transaction((tx) => account(tx, actor.userId));
  }
  invite(actor: Actor, key: unknown, body: unknown) {
    const input = adminInviteInputSchema.parse(body);
    return this.command(actor, key, 'POST admin invite', 201, input, true, async (tx) => {
      const scope = await lockAdmin(tx, actor, 'root', this.clock),
        now = this.clock();
      const [user] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, input.email), eq(users.accountStatus, 'active')));
      if (!user) throw new DomainError('NOT_FOUND', 404, 'No active account uses that email');
      const [created] = await tx
        .insert(adminAccounts)
        .values({
          userId: user.id,
          isRoot: false,
          status: 'invited',
          invitedByUserId: actor.userId,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning();
      if (!created) conflict('That account is already an admin');
      await this.grant(tx, user.id, input.roles, actor.userId, now);
      const after = await account(tx, user.id);
      await platformAudit(
        tx,
        scope,
        { action: 'admin.invited', targetType: 'admin_account', targetId: user.id, after },
        now,
      );
      return after;
    });
  }
  // The invited person activates their own admin access while signed in to their account.
  accept(actor: Actor, key: unknown) {
    return this.command(actor, key, 'POST admin accept', 200, {}, false, async (tx) => {
      const [row] = await tx
        .select()
        .from(adminAccounts)
        .where(eq(adminAccounts.userId, actor.userId))
        .for('update');
      if (!row || row.status !== 'invited')
        throw new DomainError('NOT_FOUND', 404, 'No pending admin invitation');
      const now = this.clock();
      await tx
        .update(adminAccounts)
        .set({ status: 'active', updatedAt: now })
        .where(eq(adminAccounts.userId, actor.userId));
      const after = await account(tx, actor.userId);
      await platformAudit(
        tx,
        { userId: actor.userId, isRoot: false, roles: after.roles },
        { action: 'admin.accepted', targetType: 'admin_account', targetId: actor.userId, after },
        now,
      );
      return after;
    });
  }
  change(actor: Actor, key: unknown, targetUserId: unknown, body: unknown) {
    const target = id.parse(targetUserId),
      input = adminChangeInputSchema.parse(body);
    return this.command(
      actor,
      key,
      'POST admin change',
      200,
      { target, ...input },
      true,
      async (tx) => {
        const scope = await lockAdmin(tx, actor, 'root', this.clock),
          now = this.clock();
        const [row] = await tx
          .select()
          .from(adminAccounts)
          .where(eq(adminAccounts.userId, target))
          .for('update');
        if (!row) throw new DomainError('NOT_FOUND', 404, 'Admin unavailable');
        const before = await account(tx, target),
          roots = await activeRoots(tx);
        if (input.change === 'roles') {
          if (row.isRoot) conflict('Root Admins hold every role; change Root membership instead');
          await tx
            .update(adminRoleGrants)
            .set({ revokedAt: now })
            .where(
              and(
                eq(adminRoleGrants.adminUserId, target),
                isNull(adminRoleGrants.revokedAt),
                notInArray(adminRoleGrants.role, input.roles),
              ),
            );
          await this.grant(tx, target, input.roles, actor.userId, now);
        } else if (input.change === 'status') {
          if (row.isRoot && row.status === 'active' && input.status !== 'active' && roots <= 1)
            conflict('The platform needs at least one active Root Admin');
          if (row.isRoot && row.status !== 'active' && input.status === 'active' && roots >= 3)
            conflict('At most three Root Admins may be active');
          if (row.status === 'deactivated') conflict('A deactivated admin cannot be changed');
          await tx
            .update(adminAccounts)
            .set({ status: input.status, updatedAt: now })
            .where(eq(adminAccounts.userId, target));
        } else {
          if (input.isRoot === row.isRoot) conflict('No change');
          if (input.isRoot && (row.status !== 'active' || roots >= 3))
            conflict('Only an active admin can become Root, and at most three Root Admins exist');
          if (!input.isRoot && row.status === 'active' && roots <= 1)
            conflict('The platform needs at least one active Root Admin');
          await tx
            .update(adminAccounts)
            .set({ isRoot: input.isRoot, updatedAt: now })
            .where(eq(adminAccounts.userId, target));
        }
        const after = await account(tx, target);
        await platformAudit(
          tx,
          scope,
          {
            action: 'admin.' + input.change,
            targetType: 'admin_account',
            targetId: target,
            before,
            after: { ...after, reason: input.reason },
          },
          now,
        );
        return after;
      },
    );
  }
  private async grant(
    tx: Transaction,
    userId: string,
    roles: AdminRole[],
    grantedBy: string,
    now: Date,
  ) {
    const live = await tx
      .select({ role: adminRoleGrants.role })
      .from(adminRoleGrants)
      .where(
        and(
          eq(adminRoleGrants.adminUserId, userId),
          isNull(adminRoleGrants.revokedAt),
          inArray(adminRoleGrants.role, roles),
        ),
      );
    const missing = roles.filter((role) => !live.some((row) => row.role === role));
    if (missing.length)
      await tx.insert(adminRoleGrants).values(
        missing.map((role) => ({
          adminUserId: userId,
          role,
          grantedByUserId: grantedBy,
          grantedAt: now,
        })),
      );
  }
  private command(
    actor: Actor,
    key: unknown,
    endpoint: string,
    status: 200 | 201,
    input: unknown,
    root: boolean,
    work: (tx: Transaction) => Promise<unknown>,
  ) {
    return (root ? this.rootCommands : this.idempotency)
      .execute(
        { actor, key: id.parse(key), endpoint, status },
        {},
        input,
        adminAccountSchema,
        async (tx) => (root ? Boolean(await lockAdmin(tx, actor, 'root', this.clock)) : true),
        async () => work(requireTransaction()),
      )
      .catch(inventoryFailure);
  }
}
