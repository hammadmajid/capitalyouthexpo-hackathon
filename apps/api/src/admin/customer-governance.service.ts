import { and, desc, eq, isNull, lt, notExists } from 'drizzle-orm';
import { v7 } from 'uuid';
import {
  adminAccounts,
  customerProfiles,
  managerAssignments,
  ownerProfiles,
  sessions,
  users,
  type Database,
} from '@hsm/db';
import {
  DomainError,
  customerGovernanceInputSchema,
  customerGovernancePageSchema,
  customerGovernanceQuerySchema,
  customerGovernanceRecordSchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import type { IdempotencyService } from '../idempotency/service.js';
import { requireTransaction } from '../idempotency/context.js';
import { lockAdmin, platformAudit } from './scope.js';
import { notify } from '../services/notify.js';
// HMA-015: customer enforcement never changes Admin, Owner or active Manager authority.
function eligible(tx: Transaction) {
  return and(
    notExists(
      tx
        .select({ id: adminAccounts.userId })
        .from(adminAccounts)
        .where(eq(adminAccounts.userId, users.id)),
    ),
    notExists(
      tx
        .select({ id: ownerProfiles.userId })
        .from(ownerProfiles)
        .where(eq(ownerProfiles.userId, users.id)),
    ),
    notExists(
      tx
        .select({ id: managerAssignments.userId })
        .from(managerAssignments)
        .where(
          and(eq(managerAssignments.userId, users.id), eq(managerAssignments.status, 'active')),
        ),
    ),
  );
}
const projection = {
  userId: users.id,
  fullName: users.fullName,
  status: users.accountStatus,
  updatedAt: users.updatedAt,
};
const fail = (message: string): never => {
  throw new DomainError('CONFLICT', 409, message);
};
export class CustomerGovernanceService {
  constructor(
    private readonly database: Database,
    private readonly idempotency: IdempotencyService,
    private readonly clock = () => new Date(),
  ) {}
  list(actor: Actor, query: unknown) {
    const input = customerGovernanceQuerySchema.parse(query);
    return this.database.transaction(async (tx) => {
      await lockAdmin(tx, actor, 'content_moderator', this.clock);
      const rows = await tx
        .select(projection)
        .from(users)
        .innerJoin(customerProfiles, eq(customerProfiles.userId, users.id))
        .where(
          and(
            eligible(tx),
            input.userId ? eq(users.id, input.userId) : undefined,
            eq(users.accountStatus, input.status),
            input.cursor ? lt(users.id, input.cursor) : undefined,
          ),
        )
        .orderBy(desc(users.id))
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      return customerGovernancePageSchema.parse({
        data: page.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() })),
        nextCursor: rows.length > input.limit ? page.at(-1)?.userId : null,
      });
    });
  }
  decide(actor: Actor, key: unknown, target: unknown, body: unknown) {
    const userId = stayIdentifierSchema.parse(target),
      input = customerGovernanceInputSchema.parse(body);
    if (userId === actor.userId)
      throw new DomainError('FORBIDDEN', 403, 'Self enforcement is prohibited');
    return this.idempotency.execute(
      {
        actor,
        key: stayIdentifierSchema.parse(key),
        endpoint: 'POST admin customer ' + userId,
        status: 200,
      },
      { userId },
      input,
      customerGovernanceRecordSchema,
      async (tx) => Boolean(await lockAdmin(tx, actor, 'content_moderator', this.clock)),
      async () => {
        const tx = requireTransaction();
        const [locked] = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, userId))
          .for('update');
        if (!locked) throw new DomainError('NOT_FOUND', 404, 'Customer unavailable');
        const [row] = await tx
          .select(projection)
          .from(users)
          .innerJoin(customerProfiles, eq(customerProfiles.userId, users.id))
          .where(and(eq(users.id, userId), eligible(tx)));
        if (!row) throw new DomainError('FORBIDDEN', 403, 'Customer enforcement scope unavailable');
        const now = new Date(Math.max(this.clock().getTime(), row.updatedAt.getTime() + 1));
        if (
          row.status !== input.expectedStatus ||
          row.updatedAt.toISOString() !== input.expectedUpdatedAt
        )
          fail('Customer changed. Refresh before deciding.');
        const next =
          input.action === 'warn'
            ? row.status
            : input.action === 'suspend'
              ? 'suspended'
              : input.action === 'ban'
                ? 'banned'
                : 'active';
        if (
          (input.action === 'warn' && row.status !== 'active') ||
          (input.action === 'reinstate' && !['suspended', 'banned'].includes(row.status)) ||
          (input.action !== 'warn' && next === row.status)
        )
          fail('Decision is unavailable for the current status');
        await tx
          .update(users)
          .set({ accountStatus: next, updatedAt: now })
          .where(eq(users.id, userId));
        if (next !== 'active')
          await tx
            .update(sessions)
            .set({ revokedAt: now, revokedReason: 'customer.' + input.action })
            .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
        const scope = await lockAdmin(tx, actor, 'content_moderator', this.clock);
        await platformAudit(
          tx,
          scope,
          {
            action: 'customer.' + input.action,
            targetType: 'user',
            targetId: userId,
            before: { status: row.status },
            after: { status: next, reason: input.reason },
          },
          now,
        );
        await notify(tx, userId, 'customer.' + input.action, v7(), now);
        return { ...row, status: next, updatedAt: now.toISOString() };
      },
    );
  }
}
