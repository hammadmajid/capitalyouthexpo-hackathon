import { DomainError, customerProfileInputSchema } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { requireProfileIdentity } from './profile-identity.policy.js';
import type { ProfileRepository } from './profile.repository.js';
import type { CustomerProfileStore, CustomerProfileTransaction } from './customer-profile.store.js';
function requireCustomerIdentity(
  identity: CustomerProfileTransaction['identity'],
  fullName: string,
  gender: 'male' | 'female',
) {
  const user = requireProfileIdentity(identity, fullName);
  // Existing gender corrections retain review; age remains editable.
  if (user.gender !== null && user.gender !== gender)
    throw new DomainError('CONFLICT', 409, 'Identity correction requires review', 'gender');
}
export class CustomerProfileService {
  constructor(
    private readonly store: CustomerProfileStore,
    private readonly profiles: Pick<ProfileRepository, 'read'>,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async complete(actor: Actor, input: unknown) {
    const body = customerProfileInputSchema.parse(input);
    const now = this.clock();
    await this.store.transaction(actor, async (transaction) => {
      requireCustomerIdentity(transaction.identity, body.fullName, body.gender);
      if (body.profilePhotoFileId) {
        const file = await transaction.file(body.profilePhotoFileId);
        if (!file || file.purpose !== 'avatar')
          throw new DomainError('NOT_FOUND', 404, 'Profile photo unavailable');
        if (file.scanStatus !== 'clean')
          throw new DomainError(
            'CONFLICT',
            409,
            'Profile photo is not ready',
            'profilePhotoFileId',
          );
      }
      await transaction.save(body, now);
    });
    return this.profiles.read(actor.userId);
  }
}
