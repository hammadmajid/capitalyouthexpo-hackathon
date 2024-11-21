import { and, eq } from 'drizzle-orm';
import { idempotencyKeys, type Database } from '@hsm/db';

import { lockActor } from '../auth/actor-lock.js';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import type { IdempotencyStore, IdempotencyTransaction, StoredResponse } from './store.js';
class LockedIdempotency implements IdempotencyTransaction {
  constructor(
    readonly database: Transaction,
    private readonly userId: string,
  ) {}
  private where(key: string) {
    return and(eq(idempotencyKeys.userId, this.userId), eq(idempotencyKeys.key, key));
  }
  async read(key: string) {
    const [row] = await this.database.select().from(idempotencyKeys).where(this.where(key));
    return row;
  }
  async remove(key: string) {
    // This is an expired, unreferenced response cache, not historical domain data.
    await this.database.delete(idempotencyKeys).where(this.where(key));
  }
  async save(key: string, value: StoredResponse) {
    await this.database.insert(idempotencyKeys).values({ ...value, key, userId: this.userId });
  }
}
export class IdempotencyRepository implements IdempotencyStore {
  constructor(
    private readonly database: Database,
    private readonly lock: (transaction: Transaction, actor: Actor, now: Date) => Promise<void> = (
      transaction,
      actor,
      now,
    ) => lockActor(transaction, actor, () => now),
  ) {}
  transaction<T>(
    actor: Actor,
    now: Date,
    work: (transaction: IdempotencyTransaction) => Promise<T>,
  ) {
    return this.database.transaction(async (transaction) => {
      await this.lock(transaction, actor, now);
      return work(new LockedIdempotency(transaction, actor.userId));
    });
  }
}
