import { DomainError, profileDetailsSchema } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { ProfileDetailsRepository } from './profile-details.repository.js';
export class ProfileDetailsService {
  constructor(private readonly store: Pick<ProfileDetailsRepository, 'read'>) {}
  async read(actor: Actor) {
    const profile = profileDetailsSchema.parse(await this.store.read(actor));
    if (profile.userId !== actor.userId)
      throw new DomainError('UNAUTHENTICATED', 401, 'Identity unavailable');
    return profile;
  }
}
