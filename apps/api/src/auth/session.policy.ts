import { DomainError } from '@hsm/contracts';
import { sessionFamily } from './session-family.js';

export interface PersistedSession {
  id: string;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedReason: string | null;
  replacedBySessionId: string | null;
}
export type RefreshDecision =
  | { kind: 'rotate'; session: PersistedSession }
  | { kind: 'reuse'; familyIds: string[] }
  | { kind: 'reject' };

// SEC / MGR-004: callers must persist reuse revocation before returning an error.
// The repository must hold the identity row lock while applying this decision.
export function decideRefresh(
  rows: readonly PersistedSession[],
  credentialHash: string,
  now: Date,
): RefreshDecision {
  const session = rows.find((row) => row.refreshTokenHash === credentialHash);
  if (!session) return { kind: 'reject' };
  if (session.revokedAt !== null) {
    if (session.revokedReason === 'rotated')
      return { kind: 'reuse', familyIds: [...sessionFamily(rows, session.id)] };
    return { kind: 'reject' };
  }
  if (session.expiresAt.getTime() <= now.getTime()) return { kind: 'reject' };
  return { kind: 'rotate', session };
}
export function requireActiveAccount(status: string) {
  if (status !== 'active') throw new DomainError('ACCOUNT_SUSPENDED', 403, 'Account unavailable');
}
export function requireLiveSession(session: PersistedSession | undefined, now: Date) {
  if (!session || session.revokedAt !== null || session.expiresAt.getTime() <= now.getTime())
    throw new DomainError('SESSION_REVOKED', 401, 'Session unavailable');
}
