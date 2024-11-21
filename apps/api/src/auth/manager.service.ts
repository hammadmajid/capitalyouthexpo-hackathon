import { DomainError, type managerActivationSchema } from '@hsm/contracts';
import type { z } from 'zod';
import { hashPassword, verifyPassword } from './crypto.js';
import type { ManagerStore } from './manager.store.js';
import type { SessionService } from './session.service.js';
import type { ProfileRepository } from './profile.repository.js';
import { requireActiveAccount } from './session.policy.js';
export class ManagerService {
  constructor(
    private readonly store: ManagerStore,
    private readonly sessions: SessionService,
    private readonly profiles: Pick<ProfileRepository, 'read'>,
    private readonly dummyHash: string,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async activate(input: z.infer<typeof managerActivationSchema>) {
    const now = this.clock();
    const passwordHash = await hashPassword(input.newPassword);
    const userId = await this.store.transaction(input.phone, async (transaction) => {
      const { identity, invitation } = transaction;
      const correct = await verifyPassword(
        invitation?.tempPasswordHash ?? this.dummyHash,
        input.tempPassword,
      );
      if (
        !identity ||
        identity.passwordHash !== null ||
        !invitation ||
        invitation.status !== 'pending_activation' ||
        invitation.lockedAt ||
        invitation.tempPasswordAttempts >= 5 ||
        !invitation.tempPasswordExpiresAt ||
        invitation.tempPasswordExpiresAt <= now ||
        !invitation.tempPasswordHash
      )
        return undefined;
      if (!correct) {
        await transaction.attempt(invitation.tempPasswordAttempts + 1, now);
        return undefined;
      }
      requireActiveAccount(identity.accountStatus);
      await transaction.activate(passwordHash, now);
      return identity.id;
    });
    // AUTH-M-003: commit failed attempts before returning the generic credential error.
    if (!userId) throw new DomainError('INVALID_CREDENTIALS', 401, 'Invalid credentials');
    const credentials = await this.sessions.issue(userId, input.client, (identity) => {
      if (!identity.managerActive || identity.passwordHash !== passwordHash)
        throw new DomainError('INVALID_CREDENTIALS', 401, 'Invalid credentials');
    });
    return { ...credentials, ...(await this.profiles.read(userId)) };
  }
}
