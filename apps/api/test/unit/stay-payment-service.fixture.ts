import { vi } from 'vitest';
import { StayPaymentRepository } from '../../src/stay/payment.repository.js';
import { StayPaymentService } from '../../src/stay/payment.service.js';
import { IdempotencyService } from '../../src/idempotency/service.js';
import type { IdempotencyStore, StoredResponse } from '../../src/idempotency/store.js';
import { queryFixture } from './query-fixture.js';
import { paymentIds as ids, paymentResult, paymentNow as now } from './stay-payment.fixture.js';
export function paymentServiceFixture() {
  const query = queryFixture(),
    responses = new Map<string, StoredResponse>();
  const store: IdempotencyStore = {
    transaction: async (_actor, _now, work) =>
      work({
        database: query.transaction,
        read: async (key) => responses.get(key),
        remove: async (key) => {
          responses.delete(key);
        },
        save: async (key, value) => {
          responses.set(key, value);
        },
      }),
  };
  const repo = new StayPaymentRepository(query.database, 'private-test');
  const context = vi.spyOn(repo, 'context').mockResolvedValue({ store, userId: ids.customer }),
    authorize = vi.spyOn(repo, 'authorize').mockResolvedValue(true),
    record = vi.spyOn(repo, 'record').mockResolvedValue(paymentResult);
  return {
    query,
    store,
    responses,
    context,
    authorize,
    record,
    service: new StayPaymentService(repo, new IdempotencyService(store, () => now)),
  };
}
