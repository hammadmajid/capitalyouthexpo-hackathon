import { z } from 'zod';
import { inboxReadSchema, managementPageSchema } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { IdempotencyService } from '../idempotency/service.js';
import { requireTransaction } from '../idempotency/context.js';
import { InboxRepository } from './repository.js';
const identifier = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export class InboxService {
  constructor(
    private readonly repository: InboxRepository,
    private readonly idempotency: IdempotencyService,
  ) {}
  read(actor: Actor, query: unknown) {
    return this.repository.read(actor, managementPageSchema.parse(query));
  }
  markRead(actor: Actor, key: string, input: string) {
    const id = identifier.parse(input);
    return this.idempotency.execute(
      { actor, key, endpoint: 'PUT /me/notifications/:id/read', status: 200 },
      { userId: actor.userId },
      { id },
      inboxReadSchema,
      async (transaction) => {
        await this.repository.owned(transaction, actor, id);
        return true;
      },
      () => this.repository.markRead(requireTransaction(), actor, id),
    );
  }
}
