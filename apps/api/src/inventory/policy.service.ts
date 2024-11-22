import { z } from 'zod';
import {
  platformBookingSettingsSchema,
  bookingOverrideInputSchema,
  bookingPolicyVersionSchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { IdempotencyService } from '../idempotency/service.js';
import { requireTransaction } from '../idempotency/context.js';
import { inventoryFailure } from '../booking/errors.js';
import { BookingPolicyRepository, type PolicyTarget } from './policy.repository.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export class BookingPolicyService {
  constructor(
    private readonly repository: BookingPolicyRepository,
    private readonly idempotency: IdempotencyService,
  ) {}
  read(actor: Actor, target: PolicyTarget, query: unknown = {}) {
    z.object({}).strict().parse(query);
    const scope: PolicyTarget =
      target.level === 'platform'
        ? target
        : {
            ...target,
            id: id.parse(target.id),
            ...(target.branchId ? { branchId: id.parse(target.branchId) } : {}),
          };
    return this.repository.read(actor, scope);
  }
  save(actor: Actor, key: string, target: PolicyTarget, body: unknown) {
    const scope: PolicyTarget =
      target.level === 'platform'
        ? target
        : {
            ...target,
            id: id.parse(target.id),
            ...(target.branchId ? { branchId: id.parse(target.branchId) } : {}),
          };
    const input =
      scope.level === 'platform'
        ? platformBookingSettingsSchema.parse(body)
        : bookingOverrideInputSchema.parse(body);
    return this.idempotency
      .execute(
        { actor, key, endpoint: 'PUT booking-policy ' + scope.level, status: 200 },
        scope,
        input,
        bookingPolicyVersionSchema,
        (transaction) => this.repository.authorize(transaction, actor, scope),
        () => this.repository.save(requireTransaction(), actor, scope, input),
      )
      .catch(inventoryFailure);
  }
}
