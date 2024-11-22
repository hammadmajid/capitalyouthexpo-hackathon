import { z } from 'zod';
import { favoriteInputSchema, favoriteStateSchema, managementPageSchema } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { IdempotencyService } from '../idempotency/service.js';
import { requireTransaction } from '../idempotency/context.js';
import { FavoritesRepository } from './favorites.repository.js';
export class FavoritesService {
  constructor(
    private readonly repository: FavoritesRepository,
    private readonly idempotency: IdempotencyService,
  ) {}
  list(actor: Actor, page: unknown) {
    return this.repository.list(actor, managementPageSchema.parse(page));
  }
  save(actor: Actor, key: string, branchId: string, body: unknown) {
    const branch = z.string().uuid().parse(branchId).toLowerCase(),
      input = favoriteInputSchema.parse(body);
    return this.idempotency.execute(
      { actor, key, endpoint: 'PUT /me/favorites/:branchId', status: 200 },
      { branch },
      input,
      favoriteStateSchema,
      (transaction) => this.repository.authorize(transaction, actor),
      () => this.repository.save(requireTransaction(), actor, branch, input.saved),
    );
  }
}
