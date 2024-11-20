import { z } from 'zod';
import { stayIdentifierSchema } from '@hsm/contracts';
import { notificationOutbox } from './schema/index.js';
import type { PostingTransaction } from './resident-posting-context.js';
export const residentLifecyclePayloadSchema = z
  .object({
    event: z.literal('resident.admitted'),
    stayId: stayIdentifierSchema,
    historyId: stayIdentifierSchema,
  })
  .strict();
// NTF-002 / ACC-004: recipient-free domain event avoids acquiring recipient FK
// locks under inventory locks. Source history validation and fanout run later.
export async function enqueueResidentLifecycle(
  tx: PostingTransaction,
  value: unknown,
  clock: Date,
) {
  const payload = residentLifecyclePayloadSchema.parse(value),
    now = z.date().parse(clock);
  await tx.insert(notificationOutbox).values({
    eventType: 'resident.lifecycle',
    channel: 'in_app',
    recipientUserId: null,
    payload,
    dedupeKey: 'resident.lifecycle:' + payload.event + ':' + payload.historyId,
    createdAt: now,
    nextAttemptAt: now,
  });
}
