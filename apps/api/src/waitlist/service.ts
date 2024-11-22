import { z } from 'zod';
import { joinWaitlistSchema, waitlistEntrySchema, waitlistQuerySchema } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { IdempotencyService } from '../idempotency/service.js';
import { requireTransaction } from '../idempotency/context.js';
import { WaitlistRepository } from './repository.js';
import { expectedVacancySchema, saveExpectedVacancySchema } from '@hsm/contracts';
const identifier = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export class WaitlistService {
  constructor(
    private readonly repository: WaitlistRepository,
    private readonly idempotency: IdempotencyService,
  ) {}
  list(actor: Actor, query: unknown, branchId?: string) {
    return this.repository.list(
      actor,
      waitlistQuerySchema.parse(query),
      branchId ? identifier.parse(branchId) : undefined,
    );
  }
  publicOpen(branch: string) {
    return this.repository.publicOpen(identifier.parse(branch));
  }
  vacancy(actor: Actor, branch: string, roomType: string) {
    return this.repository.vacancy(actor, identifier.parse(branch), identifier.parse(roomType));
  }
  saveVacancy(actor: Actor, key: string, branch: string, roomType: string, body: unknown) {
    const branchId = identifier.parse(branch),
      roomTypeId = identifier.parse(roomType),
      input = saveExpectedVacancySchema.parse(body);
    return this.idempotency.execute(
      {
        actor,
        key,
        endpoint: 'PUT /branches/:branchId/room-types/:roomTypeId/expected-vacancy',
        status: 200,
      },
      { branchId, roomTypeId },
      input,
      expectedVacancySchema,
      (tx) => this.repository.authorizeVacancy(tx, actor, branchId, roomTypeId),
      () => this.repository.saveVacancy(requireTransaction(), actor, branchId, roomTypeId, input),
    );
  }
  join(actor: Actor, key: string, body: unknown) {
    const input = joinWaitlistSchema.parse(body);
    return this.idempotency.execute(
      { actor, key, endpoint: 'POST /me/waitlist', status: 200 },
      { branch: input.branchId },
      input,
      waitlistEntrySchema,
      (tx) => this.repository.authorize(tx, actor),
      () => this.repository.join(requireTransaction(), actor, input),
    );
  }
  leave(actor: Actor, key: string, entryId: string) {
    const entry = identifier.parse(entryId);
    return this.idempotency.execute(
      { actor, key, endpoint: 'DELETE /me/waitlist/:entryId', status: 200 },
      { entry },
      {},
      waitlistEntrySchema,
      (tx) => this.repository.authorize(tx, actor, undefined, entry),
      () => this.repository.leave(requireTransaction(), actor, entry),
    );
  }
}
