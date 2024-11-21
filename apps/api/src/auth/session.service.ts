import { randomBytes } from 'node:crypto';
import { v7 } from 'uuid';
import { DomainError } from '@hsm/contracts';
import { AuthCrypto, hashPassword, verifyPassword } from './crypto.js';
import { decideRefresh, requireActiveAccount, requireLiveSession } from './session.policy.js';
import type {
  NewSession,
  SessionIdentity,
  SessionStore,
  SessionTransaction,
} from './session.store.js';

export class SessionService {
  constructor(
    private readonly store: SessionStore,
    private readonly crypto: AuthCrypto,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  private create(client: 'web' | 'mobile', now: Date) {
    const refreshToken = randomBytes(48).toString('base64url');
    const row: NewSession = {
      id: v7(),
      client,
      refreshTokenHash: this.crypto.digest(refreshToken, 'refresh'),
      createdAt: now,
      lastUsedAt: now,
      expiresAt: new Date(now.getTime() + 30 * 86400000),
    };
    return { row, refreshToken };
  }
  private active(transaction: SessionTransaction) {
    if (!transaction.identity)
      throw new DomainError('UNAUTHENTICATED', 401, 'Authentication required');
    requireActiveAccount(transaction.identity.accountStatus);
    return transaction.identity;
  }
  private async credentials(
    userId: string,
    value: ReturnType<SessionService['create']>,
    now: Date,
  ) {
    return {
      accessToken: await this.crypto.access(userId, value.row.id, now),
      refreshToken: value.refreshToken,
      expiresIn: 600,
      sessionId: value.row.id,
      client: value.row.client,
    };
  }
  async issue(
    userId: string,
    client: 'web' | 'mobile',
    validate?: (identity: SessionIdentity) => void,
  ) {
    const now = this.clock();
    const value = this.create(client, now);
    await this.store.transaction(userId, async (transaction) => {
      const identity = this.active(transaction);
      validate?.(identity);
      await transaction.insert(value.row);
    });
    return this.credentials(userId, value, now);
  }
  async refresh(refreshToken: string, client?: 'web' | 'mobile') {
    const hash = this.crypto.digest(refreshToken, 'refresh');
    const userId = await this.store.identify(hash);
    if (!userId) throw new DomainError('SESSION_REVOKED', 401, 'Session unavailable');
    const now = this.clock();
    const value = await this.store.transaction(userId, async (transaction) => {
      this.active(transaction);
      const rows = await transaction.list();
      const decision = decideRefresh(rows, hash, now);
      if (decision.kind === 'reuse') {
        await transaction.revoke(decision.familyIds, 'refresh_reuse', now);
        return undefined;
      }
      if (decision.kind === 'reject') return undefined;
      const previous = rows.find((row) => row.id === decision.session.id);
      if (!previous || (client && previous.client !== client)) return undefined;
      const next = this.create(previous.client, now);
      await transaction.rotate(decision.session.id, next.row, now);
      return next;
    });
    // SEC: throw outside the transaction so reuse revocation commits.
    if (!value) throw new DomainError('SESSION_REVOKED', 401, 'Session unavailable');
    return this.credentials(userId, value, now);
  }
  async authenticate(accessToken: string) {
    const now = this.clock();
    const claims = await this.crypto.claims(accessToken, now);
    return this.store.transaction(claims.sub, async (transaction) => {
      this.active(transaction);
      const session = (await transaction.list()).find((row) => row.id === claims.sid);
      requireLiveSession(session, now);
      return { userId: claims.sub, sessionId: claims.sid };
    });
  }
  async changePassword(
    userId: string,
    sessionId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const hash = await hashPassword(newPassword);
    const now = this.clock();
    await this.store.transaction(userId, async (transaction) => {
      const identity = this.active(transaction);
      const rows = await transaction.list();
      requireLiveSession(
        rows.find((row) => row.id === sessionId),
        now,
      );
      if (!(await verifyPassword(identity.passwordHash ?? null, currentPassword)))
        throw new DomainError('INVALID_CREDENTIALS', 401, 'Invalid credentials');
      // SEC: password changes and device revocation share the identity lock and transaction.
      await transaction.setPassword(hash, now);
      await transaction.revoke(
        rows.filter((row) => row.id !== sessionId && !row.revokedAt).map((row) => row.id),
        'password_change',
        now,
      );
    });
  }
  async logout(userId: string, sessionId: string, all = false) {
    const now = this.clock();
    await this.store.transaction(userId, async (transaction) => {
      this.active(transaction);
      const rows = await transaction.list();
      const current = rows.find((row) => row.id === sessionId);
      requireLiveSession(current, now);
      await transaction.revoke(all ? rows.map((row) => row.id) : [sessionId], 'logout', now);
    });
  }
}
