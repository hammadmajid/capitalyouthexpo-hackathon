import { z } from 'zod';
import { notificationOutbox } from './schema/services.js';
import type { Database } from './index.js';
export const visitLifecyclePayloadSchema = z
  .object({
    event: z.enum(['visit.changed', 'visit.follow_up']),
    visitId: z.string().uuid(),
    historyId: z.string().uuid(),
  })
  .strict();
export type VisitLifecycleTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];
// VISIT-001 / NTF-002: no recipient FK locks while the caller holds branch locks.
export async function enqueueVisitLifecycle(
  tx: VisitLifecycleTransaction,
  input: unknown,
  now: Date,
) {
  const payload = visitLifecyclePayloadSchema.parse(input);
  await tx
    .insert(notificationOutbox)
    .values({
      eventType: 'visit.lifecycle',
      channel: 'in_app',
      recipientUserId: null,
      payload,
      dedupeKey:
        payload.event === 'visit.changed'
          ? 'visit.lifecycle:' + payload.historyId
          : 'visit.follow_up:' + payload.visitId,
      createdAt: now,
      nextAttemptAt: now,
    })
    .onConflictDoNothing({ target: notificationOutbox.dedupeKey });
}
