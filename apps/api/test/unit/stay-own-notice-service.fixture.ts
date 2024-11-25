import { vi } from 'vitest';
import {
  OwnStayNoticeService,
  type OwnStayNoticeOperations,
} from '../../src/stay/own-notice.service.js';
import { IdempotencyService } from '../../src/idempotency/service.js';
import type { IdempotencyStore, StoredResponse } from '../../src/idempotency/store.js';
import { queryFixture } from './query-fixture.js';
import { noticeNow as now, noticeResult as result } from './stay-own-notice.fixture.js';
export function ownNoticeServiceFixture() {
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
  const authorize = vi.fn<OwnStayNoticeOperations['authorize']>().mockResolvedValue(true),
    submit = vi.fn<OwnStayNoticeOperations['submit']>().mockResolvedValue(result);
  return {
    query,
    responses,
    authorize,
    submit,
    service: new OwnStayNoticeService(
      { authorize, submit },
      new IdempotencyService(store, () => now),
    ),
  };
}
