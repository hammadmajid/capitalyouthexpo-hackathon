import { z } from 'zod';
import { inboxPageSchema, inboxReadSchema, managementPageSchema } from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { readApi } from './result.js';
import { setupPageQuery } from './owner-setup-body.js';
export function listNotifications(
  client: ApiClient,
  page: { cursor?: string; limit?: number } = {},
) {
  return readApi(
    client.GET('/v1/me/notifications', {
      params: { query: setupPageQuery(managementPageSchema.parse(page)) },
    }),
    inboxPageSchema,
  );
}
export function markNotificationRead(client: ApiClient, notificationId: string, key: string) {
  return readApi(
    client.PUT('/v1/me/notifications/{id}/read', {
      params: {
        path: { id: z.string().uuid().parse(notificationId) },
        header: { 'Idempotency-Key': z.string().uuid().parse(key) },
      },
    }),
    inboxReadSchema,
  );
}
