import { z } from 'zod';
import type { ObservabilityConfig } from './config.js';
const identifierSchema = z.string().regex(/^[a-f0-9]{32}$/);
const envelopeSchema = z.tuple([
  z.unknown(),
  z.array(z.tuple([z.object({ type: z.string() }), z.unknown()])).max(100),
]);
// SEC-003: reconstruct fixed error telemetry; never copy the original event or hints.
export function privateException(config: ObservabilityConfig, eventId: string) {
  if (!identifierSchema.safeParse(eventId).success) throw new Error('Invalid telemetry identifier');
  return {
    event_id: eventId,
    level: 'error' as const,
    platform: 'javascript',
    environment: config.environment,
    tags: { service: config.service, code: 'INTERNAL' },
    exception: {
      values: [{ type: 'ApplicationFailure', value: 'Unexpected application failure' }],
    },
    fingerprint: ['hsm', config.service, 'INTERNAL'],
  };
}
export type PrivateException = ReturnType<typeof privateException>;
export interface PrivateEnvelope {
  headers: { event_id: string; sent_at: string };
  items: [{ type: 'event' }, PrivateException][];
}
// beforeSend alone cannot remove attachments or internal SDK events. Guard the final envelope.
export function privateEnvelope(
  original: unknown,
  config: ObservabilityConfig,
  eventId: string,
): PrivateEnvelope {
  const event = privateException(config, eventId);
  const parsed = envelopeSchema.safeParse(original);
  const containsError =
    parsed.success && parsed.data[1].some(([header]) => header.type === 'event');
  return {
    headers: { event_id: eventId, sent_at: new Date().toISOString() },
    items: containsError ? [[{ type: 'event' }, event]] : [],
  };
}
