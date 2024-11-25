import { z } from 'zod';
import { selfProfileSchema, type SelfProfile } from '@hsm/contracts';
import { ApiFailure, readApi, type ApiClient } from '@hsm/api-client';
export const webSessionSchema = z
  .object({
    client: z.literal('web'),
    expiresIn: z.literal(600),
    sessionId: z.string().uuid(),
  })
  .strict();
export const webLoginSchema = webSessionSchema.extend(selfProfileSchema.shape).strict();
type RefreshCoordinator = (work: () => Promise<SelfProfile>) => Promise<SelfProfile>;
export async function restoreSession(
  client: ApiClient,
  hasRefreshHint: () => boolean,
  coordinate?: RefreshCoordinator,
): Promise<SelfProfile> {
  try {
    return await readApi(client.GET('/v1/me'), selfProfileSchema);
  } catch (error) {
    if (
      !(error instanceof ApiFailure) ||
      !['UNAUTHENTICATED', 'TOKEN_EXPIRED'].includes(error.code)
    )
      throw error;
    if (!hasRefreshHint()) throw error;
    if (coordinate) return coordinate(() => restoreSession(client, hasRefreshHint));
    await readApi(client.POST('/v1/auth/refresh', { body: {} }), webSessionSchema);
    return readApi(client.GET('/v1/me'), selfProfileSchema);
  }
}
