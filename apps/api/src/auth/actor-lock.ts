import { and, eq } from 'drizzle-orm';
import { sessions, users } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
import type { Actor } from '../authorization/store.js';
import { requireActiveAccount, requireLiveSession } from './session.policy.js';
// SEC-003: identity-first locks serialize protected work with logout and revocation.
export async function lockActor(transaction: Transaction, actor: Actor, clock: () => Date) {
  const [identity] = await transaction
    .select({ status: users.accountStatus })
    .from(users)
    .where(eq(users.id, actor.userId))
    .for('update');
  if (!identity) throw new DomainError('UNAUTHENTICATED', 401, 'Identity unavailable');
  requireActiveAccount(identity.status);
  const [session] = await transaction
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, actor.sessionId), eq(sessions.userId, actor.userId)));
  requireLiveSession(session, clock());
}
