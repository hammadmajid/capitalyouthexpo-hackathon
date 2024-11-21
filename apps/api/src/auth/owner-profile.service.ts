import { DomainError, ownerProfileInputSchema } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { AuthCrypto } from './crypto.js';
import type { ProfileRepository } from './profile.repository.js';
import { requireProfileIdentity } from './profile-identity.policy.js';
import type { OwnerProfileStore } from './owner-profile.store.js';
export class OwnerProfileService {
  constructor(
    private readonly store: OwnerProfileStore,
    private readonly crypto: AuthCrypto,
    private readonly profiles: Pick<ProfileRepository, 'read'>,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async complete(actor: Actor, input: unknown) {
    const { cnic, ...body } = ownerProfileInputSchema.parse(input);
    const now = this.clock();
    await this.store.transaction(actor, async (transaction) => {
      const identity = requireProfileIdentity(transaction.identity, body.fullName);
      const protectedCnic = this.crypto.protectCnic(cnic);
      if (
        identity.cnicHash &&
        !this.crypto.equals(
          identity.cnicHash.toString('hex'),
          protectedCnic.cnicHash.toString('hex'),
        )
      )
        throw new DomainError('CONFLICT', 409, 'Identity correction requires review');
      const attachments = [
        ...(body.cnicFrontFileId
          ? [{ id: body.cnicFrontFileId, purpose: 'verification_document' }]
          : []),
        ...(body.cnicBackFileId
          ? [{ id: body.cnicBackFileId, purpose: 'verification_document' }]
          : []),
        ...(body.profilePhotoFileId ? [{ id: body.profilePhotoFileId, purpose: 'avatar' }] : []),
      ];
      for (const attachment of attachments) {
        const file = await transaction.file(attachment.id);
        if (!file || file.purpose !== attachment.purpose)
          throw new DomainError('NOT_FOUND', 404, 'Owner document unavailable');
        if (file.scanStatus !== 'clean')
          throw new DomainError('CONFLICT', 409, 'Owner document is not ready');
      }
      await transaction.save(body, protectedCnic, now);
    });
    return this.profiles.read(actor.userId);
  }
}
