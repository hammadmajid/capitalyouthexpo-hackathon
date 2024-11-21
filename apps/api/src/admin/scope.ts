import { and, eq, isNull, sql } from 'drizzle-orm';
import { adminAccounts, adminRoleGrants, users } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
export type AdminRole = 'verification' | 'support' | 'content_moderator';
export type AdminScope = { userId: string; isRoot: boolean; roles: AdminRole[] };
// ADM-001..006 / SEC-001: re-prove the live admin account and role inside the transaction.
// Root may act for every Normal Admin role; there is no implicit all-access Normal Admin.
export async function lockAdmin(
  tx: Transaction,
  actor: Actor,
  need: AdminRole | 'root',
  clock: () => Date,
): Promise<AdminScope> {
  await lockActor(tx, actor, clock);
  const [account] = await tx
    .select({ isRoot: adminAccounts.isRoot, status: adminAccounts.status })
    .from(adminAccounts)
    .innerJoin(users, eq(users.id, adminAccounts.userId))
    .where(and(eq(adminAccounts.userId, actor.userId), eq(users.accountStatus, 'active')))
    .for('share');
  if (!account || account.status !== 'active')
    throw new DomainError('FORBIDDEN', 403, 'Admin access unavailable');
  const grants = await tx
    .select({ role: adminRoleGrants.role })
    .from(adminRoleGrants)
    .where(and(eq(adminRoleGrants.adminUserId, actor.userId), isNull(adminRoleGrants.revokedAt)));
  const roles = grants
    .map((grant) => grant.role)
    .filter((role): role is AdminRole => role !== 'billing');
  const allowed = need === 'root' ? account.isRoot : account.isRoot || roles.includes(need);
  if (!allowed) throw new DomainError('FORBIDDEN', 403, 'Admin role required');
  return { userId: actor.userId, isRoot: account.isRoot, roles };
}
// p.41 root cap: serialize Root membership changes; the database trigger keeps 1..3 roots.
export async function lockRootChanges(tx: Transaction) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('hsm:root-admin-membership'))`);
}
const writer = new AuditWriter();
export async function platformAudit(
  tx: Transaction,
  scope: AdminScope,
  event: {
    action: string;
    targetType: string;
    targetId: string;
    before?: unknown;
    after?: unknown;
  },
  now: Date,
) {
  await writer.platform(tx, {
    actorUserId: scope.userId,
    actorRole: scope.isRoot ? 'root' : 'admin:' + scope.roles.join('+'),
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId,
    before: (event.before ?? null) as Record<string, unknown> | null,
    after: (event.after ?? null) as Record<string, unknown> | null,
    createdAt: now,
  });
}
