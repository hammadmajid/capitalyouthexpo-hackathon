import { and, eq, inArray } from 'drizzle-orm';
import { sessions, users } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
import type { Actor } from '../authorization/store.js';
import { requireActiveAccount, requireLiveSession } from '../auth/session.policy.js';
// SEC-001/MGR-004: dual-capability identities must use a single global lock order.
export async function lockParticipants(
  transaction: Transaction,
  actor: Actor,
  targetId: string,
  clock: () => Date,
) {
  const identities = await transaction
    .select({ id: users.id, status: users.accountStatus })
    .from(users)
    .where(inArray(users.id, [...new Set([actor.userId, targetId])].sort()))
    .orderBy(users.id)
    .for('update');
  const identity = identities.find((row) => row.id === actor.userId);
  if (!identity) throw new DomainError('UNAUTHENTICATED', 401, 'Identity unavailable');
  requireActiveAccount(identity.status);
  const [session] = await transaction
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, actor.sessionId), eq(sessions.userId, actor.userId)));
  requireLiveSession(session, clock());
}
