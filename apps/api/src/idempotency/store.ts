import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
export type StoredResponse = {
  endpoint: string;
  requestHash: Buffer;
  responseStatus: number;
  responseBody: unknown;
  createdAt: Date;
};
export interface IdempotencyTransaction {
  database: Transaction;
  read(key: string): Promise<StoredResponse | undefined>;
  remove(key: string): Promise<void>;
  save(key: string, value: StoredResponse): Promise<void>;
}
export interface IdempotencyStore {
  transaction<T>(
    actor: Actor,
    now: Date,
    work: (transaction: IdempotencyTransaction) => Promise<T>,
  ): Promise<T>;
}
