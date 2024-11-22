import {
  DomainError,
  stayIdentifierSchema,
  stayNoticeInputSchema,
  stayNoticeResultSchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { IdempotencyService } from '../idempotency/service.js';
import { requireTransaction } from '../idempotency/context.js';
import { z } from 'zod';
import type { Transaction } from '../audit/writer.js';
export interface OwnStayNoticeOperations {
  authorize(tx: Transaction, actor: Actor, stayId: string): Promise<boolean>;
  submit(
    tx: Transaction,
    actor: Actor,
    stayId: string,
    notice: z.infer<typeof stayNoticeInputSchema>,
  ): Promise<unknown>;
}
export class OwnStayNoticeService {
  constructor(
    private readonly repository: OwnStayNoticeOperations,
    private readonly idempotency: IdempotencyService,
  ) {}
  async submit(actor: Actor, key: unknown, inputStay: unknown, body: unknown) {
    const stayId = stayIdentifierSchema.parse(inputStay),
      commandId = stayIdentifierSchema.parse(key),
      notice = stayNoticeInputSchema.parse(body);
    const result = stayNoticeResultSchema.refine(
      (value) =>
        value.stayId === stayId &&
        value.version === notice.expectedVersion + 1 &&
        value.plan.requestedCheckoutDate === notice.requestedCheckoutDate &&
        value.plan.isEmergency === notice.isEmergency,
    );
    try {
      return await this.idempotency.execute(
        { actor, key: commandId, endpoint: 'POST own Stay departure notice', status: 201 },
        { stayId },
        notice,
        result,
        (tx) => this.repository.authorize(tx, actor, stayId),
        () => this.repository.submit(requireTransaction(), actor, stayId, notice),
      );
    } catch (error) {
      if (error instanceof z.ZodError)
        throw new DomainError('INTERNAL', 500, 'Notice response unavailable');
      throw error;
    }
  }
}
