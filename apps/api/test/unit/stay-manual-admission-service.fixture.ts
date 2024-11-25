import { vi } from 'vitest';
import { StayManualAdmissionRepository } from '../../src/stay/manual-admission.repository.js';
import { StayManualAdmissionService } from '../../src/stay/manual-admission.service.js';
import { IdempotencyService } from '../../src/idempotency/service.js';
import type { IdempotencyStore, StoredResponse } from '../../src/idempotency/store.js';
import { queryFixture } from './query-fixture.js';
import { paymentNow as now } from './stay-payment.fixture.js';
import { admissionResult } from './stay-manual-admission.fixture.js';
export function manualAdmissionServiceFixture() {
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
  const repo = new StayManualAdmissionRepository(query.database, () => now);
  const context = vi.spyOn(repo, 'context').mockResolvedValue({ store, userId: null }),
    authorize = vi.spyOn(repo, 'authorize').mockResolvedValue(true),
    admit = vi.spyOn(repo, 'admit').mockResolvedValue(admissionResult);
  return {
    query,
    store,
    responses,
    context,
    authorize,
    admit,
    service: new StayManualAdmissionService(repo, new IdempotencyService(store, () => now)),
  };
}
