import { z } from 'zod';
import {
  institutionGovernanceInputSchema,
  institutionUpdateInputSchema,
  institutionStateSchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { IdempotencyService } from '../idempotency/service.js';
import { requireTransaction } from '../idempotency/context.js';
import { inventoryFailure } from '../booking/errors.js';
import { InstitutionRepository } from './directory.repository.js';
export class InstitutionService {
  constructor(
    private readonly repository: InstitutionRepository,
    private readonly idempotency: IdempotencyService,
  ) {}
  save(actor: Actor, key: string, body: unknown, placeId?: string) {
    const input = (placeId ? institutionUpdateInputSchema : institutionGovernanceInputSchema).parse(
        body,
      ),
      id = placeId ? z.string().uuid().parse(placeId).toLowerCase() : undefined;
    return this.idempotency
      .execute(
        {
          actor,
          key,
          endpoint: id ? 'PUT /admin/institutions/:placeId' : 'POST /admin/institutions',
          status: id ? 200 : 201,
        },
        id ? { id } : {},
        input,
        institutionStateSchema,
        (database) => this.repository.authorize(database, actor),
        () => this.repository.save(requireTransaction(), actor, input, id),
      )
      .catch(inventoryFailure);
  }
}
