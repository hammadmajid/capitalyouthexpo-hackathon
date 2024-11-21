import { describe, expect, it } from 'vitest';
import {
  decideRefresh,
  requireActiveAccount,
  requireLiveSession,
  type PersistedSession,
} from './session.policy.js';
const now = new Date('2026-10-07T12:00:00Z');
const row = (overrides: Partial<PersistedSession> = {}): PersistedSession => ({
  id: 'a',
  refreshTokenHash: 'hash-a',
  expiresAt: new Date(now.getTime() + 1000),
  revokedAt: null,
  revokedReason: null,
  replacedBySessionId: null,
  ...overrides,
});
describe('SEC: persisted refresh decisions', () => {
  it('accepts an unrevoked, unexpired credential for one rotation', () => {
    const session = row();
    expect(decideRefresh([session], 'hash-a', now)).toEqual({ kind: 'rotate', session });
  });
  it('rejects unknown, expired and explicitly revoked credentials', () => {
    expect(decideRefresh([], 'unknown', now)).toEqual({ kind: 'reject' });
    expect(decideRefresh([row({ expiresAt: now })], 'hash-a', now)).toEqual({ kind: 'reject' });
    expect(
      decideRefresh([row({ revokedAt: now, revokedReason: 'logout' })], 'hash-a', now),
    ).toEqual({ kind: 'reject' });
  });
  it('detects old-token reuse even after expiry and identifies only its family', () => {
    const rows = [
      row({ revokedAt: now, revokedReason: 'rotated', replacedBySessionId: 'b', expiresAt: now }),
      row({
        id: 'b',
        refreshTokenHash: 'hash-b',
        replacedBySessionId: 'c',
        revokedAt: now,
        revokedReason: 'rotated',
      }),
      row({ id: 'c', refreshTokenHash: 'hash-c' }),
      row({ id: 'other-device', refreshTokenHash: 'unrelated' }),
    ];
    const decision = decideRefresh(rows, 'hash-a', now);
    expect(decision.kind).toBe('reuse');
    if (decision.kind !== 'reuse') throw new Error('Expected reuse decision');
    expect(new Set(decision.familyIds)).toEqual(new Set(['a', 'b', 'c']));
  });
});
describe('SEC / MGR-004: immediate persisted-state enforcement', () => {
  it.each(['suspended', 'banned', 'deactivated', 'unclaimed'])('denies %s identities', (status) => {
    expect(() => requireActiveAccount(status)).toThrow(
      expect.objectContaining({ code: 'ACCOUNT_SUSPENDED' }),
    );
  });
  it('allows an active identity and live session', () => {
    expect(() => requireActiveAccount('active')).not.toThrow();
    expect(() => requireLiveSession(row(), now)).not.toThrow();
  });
  it('denies missing, expired and revoked sessions on the next check', () => {
    for (const session of [undefined, row({ expiresAt: now }), row({ revokedAt: now })])
      expect(() => requireLiveSession(session, now)).toThrow(
        expect.objectContaining({ code: 'SESSION_REVOKED' }),
      );
  });
});
