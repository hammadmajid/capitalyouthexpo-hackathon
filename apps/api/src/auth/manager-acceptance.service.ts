import type { Actor } from '../authorization/store.js';
import type { ManagerAcceptanceRepository } from './manager-acceptance.repository.js';
import type { ProfileRepository } from './profile.repository.js';
export class ManagerAcceptanceService {
  constructor(
    private readonly repository: Pick<ManagerAcceptanceRepository, 'accept'>,
    private readonly profiles: Pick<ProfileRepository, 'read'>,
  ) {}
  async accept(actor: Actor) {
    await this.repository.accept(actor);
    return this.profiles.read(actor.userId);
  }
}
