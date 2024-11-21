import { z } from 'zod';
import { DomainError } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import { fingerprint, isExpired, requireMatchingReplay, safeResponse } from './policy.js';
import { inTransaction } from './context.js';
import type { IdempotencyStore } from './store.js';
const command = z
  .object({
    actor: z.object({ userId: z.string().uuid(), sessionId: z.string().uuid() }).strict(),
    key: z.string().uuid(),
    endpoint: z.string().min(1).max(300),
    status: z.union([z.literal(200), z.literal(201), z.literal(202)]),
  })
  .strict();
export type IdempotencyCommand = {
  actor: Actor;
  key: string;
  endpoint: string;
  status: 200 | 201 | 202;
};
export class IdempotencyService {
  constructor(
    private readonly store: IdempotencyStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  withStore(store: IdempotencyStore) {
    return new IdempotencyService(store, this.clock);
  }
  async execute<T>(
    input: IdempotencyCommand,
    scope: unknown,
    body: unknown,
    schema: z.ZodType<T>,
    authorize: (transaction: Transaction) => Promise<boolean>,
    work: () => Promise<unknown>,
    options?: { maximumResponseBytes: 65536 | 262144 },
  ) {
    const value = command.parse(input),
      now = this.clock();
    const requestHash = fingerprint(value.endpoint, scope, body);
    return this.store.transaction(value.actor, now, async (transaction) => {
      // Revalidate live scope before replay as well as before a new mutation.
      if (!(await authorize(transaction.database)))
        throw new DomainError('FORBIDDEN', 403, 'Scope unavailable');
      const previous = await transaction.read(value.key);
      if (previous && !isExpired(previous.createdAt, now)) {
        requireMatchingReplay(previous, value.endpoint, requestHash);
        return {
          status: previous.responseStatus,
          body: safeResponse(schema, previous.responseBody, options?.maximumResponseBytes),
          replayed: true,
        };
      }
      if (previous) await transaction.remove(value.key);
      const response = safeResponse(
        schema,
        await inTransaction(transaction.database, work),
        options?.maximumResponseBytes,
      );
      await transaction.save(value.key, {
        endpoint: value.endpoint,
        requestHash,
        responseStatus: value.status,
        responseBody: response,
        createdAt: now,
      });
      return { status: value.status, body: response, replayed: false };
    });
  }
}
