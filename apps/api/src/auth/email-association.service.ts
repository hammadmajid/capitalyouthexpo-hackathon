import {
  DomainError,
  selfProfileSchema,
  emailAssociationRequestSchema,
  emailAssociationVerificationSchema,
  type EmailAssociationRequest,
  type EmailAssociationVerification,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { verifyPassword } from './crypto.js';
import type { OtpService } from './otp.service.js';
import type { ProfileRepository } from './profile.repository.js';
import type {
  EmailAssociationStore,
  EmailAssociationTransaction,
} from './email-association.store.js';
import { requireActiveAccount } from './session.policy.js';
const unavailable = () => new DomainError('INVALID_CREDENTIALS', 401, 'Verification unavailable');
export class EmailAssociationService {
  constructor(
    private readonly store: EmailAssociationStore,
    private readonly otp: OtpService,
    private readonly profiles: Pick<ProfileRepository, 'read'>,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  private async eligible(transaction: EmailAssociationTransaction) {
    const identity = transaction.identity;
    if (!identity) throw new DomainError('UNAUTHENTICATED', 401, 'Identity unavailable');
    requireActiveAccount(identity.accountStatus);
    if (
      !identity.passwordHash ||
      identity.email !== null ||
      identity.emailVerifiedAt !== null ||
      !(await transaction.managerAllowed())
    )
      throw new DomainError('FORBIDDEN', 403, 'Email association unavailable');
    return identity;
  }
  async request(actor: Actor, body: EmailAssociationRequest) {
    const input = emailAssociationRequestSchema.parse(body),
      now = this.clock();
    await this.store.transaction(actor, async (transaction) => {
      const identity = await this.eligible(transaction);
      if (!(await verifyPassword(identity.passwordHash, input.currentPassword)))
        throw unavailable();
      if (!(await transaction.emailAvailable(input.email))) return;
      await this.otp.issue(transaction, 'email_change', now, input.email);
    });
    // Claimed email and resend cooldown share the acknowledgement; never merge identities.
    return { accepted: true as const };
  }
  async verify(actor: Actor, body: EmailAssociationVerification) {
    const input = emailAssociationVerificationSchema.parse(body),
      now = this.clock();
    const verified = await this.store.transaction(actor, async (transaction) => {
      const identity = await this.eligible(transaction),
        row = await transaction.latest('email_change');
      if (
        !row ||
        row.purpose !== 'email_change' ||
        row.userId !== actor.userId ||
        row.email !== input.email ||
        row.consumedAt ||
        row.expiresAt <= now ||
        row.attempts >= 5
      )
        return false;
      await transaction.attempt(row.id, row.attempts + 1);
      if (
        !this.otp.matches(identity.id, 'email_change', input.code, row.codeHash) ||
        !(await transaction.emailAvailable(input.email))
      )
        return false;
      await transaction.consume(row.id, now);
      await transaction.bindEmail(input.email, now);
      return true;
    });
    // Failed attempts must commit before the public error is thrown.
    if (!verified) throw unavailable();
    const profile = selfProfileSchema.parse(await this.profiles.read(actor.userId));
    if (
      profile.user.id !== actor.userId ||
      !profile.user.emailVerified ||
      profile.user.email !== input.email
    )
      throw unavailable();
    return profile;
  }
}
