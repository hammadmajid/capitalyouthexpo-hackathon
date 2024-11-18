import {
  stayIdentifierSchema,
  stayNoticeInputSchema,
  stayNoticeResultSchema,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
// OUT-001/002/006 / SEC-003: notice discloses timing; it never releases occupancy.
// The caller retains the original command/key after an uncertain outcome.
export async function submitOwnStayNotice(
  client: ApiClient,
  stay: unknown,
  body: unknown,
  key: string,
) {
  const stayId = stayIdentifierSchema.parse(stay),
    commandId = stayIdentifierSchema.parse(key),
    notice = stayNoticeInputSchema.parse(body),
    { reason, ...required } = notice;
  const result = await readApi(
    client.POST('/v1/me/stays/{stayId}/checkout-request', {
      params: { path: { stayId }, header: { 'Idempotency-Key': commandId } },
      body: { ...required, ...(reason === undefined ? {} : { reason }) },
    }),
    stayNoticeResultSchema,
  );
  if (
    result.stayId !== stayId ||
    result.version !== notice.expectedVersion + 1 ||
    result.plan.requestedCheckoutDate !== notice.requestedCheckoutDate ||
    result.plan.isEmergency !== notice.isEmergency
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
