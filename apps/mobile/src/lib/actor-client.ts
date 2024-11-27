import { z } from 'zod';
import {
  createApiClient,
  ClientFailure,
  readApi,
  type ApiClient,
  type ApiClientOptions,
} from '@hsm/api-client';
import { selfProfileSchema } from '@hsm/contracts';
// SEC-003: freeze credentials, then verify identity before sending private state.
// A late vault read must never silently turn account A's form into account B's request.
export async function bindActorClient(
  options: {
    baseUrl: string;
    accessToken: () => Promise<string | undefined>;
    fetch?: ApiClientOptions['fetch'];
    // Refreshes the stored session and returns the account its new token belongs to.
    renew?: () => Promise<{ actorId: string; token: string } | undefined>;
  },
  expectedActorId: string,
) {
  const actorId = z.string().uuid().parse(expectedActorId).toLowerCase();
  const token = await options.accessToken();
  if (!token) throw new ClientFailure('INVALID_RESPONSE');
  const held = { token };
  const send = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const bound = createApiClient({
    baseUrl: options.baseUrl,
    authentication: { kind: 'bearer', accessToken: async () => held.token },
    fetch: options.renew ? renewing(send, actorId, options.renew, held) : send,
  });
  const profile = await readApi(bound.GET('/v1/me'), selfProfileSchema);
  if (profile.user.id.toLowerCase() !== actorId) throw new ClientFailure('INVALID_RESPONSE');
  return bound;
}

/** Reuse identity-verified transport only for the exact actor/token pair.
 * Every API request still performs server authentication and object authorization.
 * One in-memory entry; token/account changes and failed bindings never reuse it.
 */
export function createActorClientBinder(options: Parameters<typeof bindActorClient>[0]) {
  let current: { actorId: string; token: string; client: Promise<ApiClient> } | undefined;
  return async (expectedActorId: string) => {
    const actorId = z.string().uuid().parse(expectedActorId).toLowerCase();
    const token = await options.accessToken();
    if (!token) {
      current = undefined;
      throw new ClientFailure('INVALID_RESPONSE');
    }
    if (current?.actorId === actorId && current.token === token) return current.client;
    const client = bindActorClient({ ...options, accessToken: async () => token }, actorId);
    current = { actorId, token, client };
    try {
      return await client;
    } catch (error) {
      if (current?.client === client) current = undefined;
      throw error;
    }
  };
}

// Access tokens last ~10 minutes. A 401 renews the stored session once and retries the same
// request, so screens never show "sign-in expired" for a still-valid session. SEC-003: the new
// token is used only when the server proved it belongs to this same actor.
function renewing(
  send: typeof fetch,
  actorId: string,
  renew: () => Promise<{ actorId: string; token: string } | undefined>,
  held: { token: string },
): typeof fetch {
  return async (input, init) => {
    const copy = input instanceof Request ? input.clone() : undefined;
    const response = await send(input, init);
    if (response.status !== 401 || !copy) return response;
    const fresh = await renew().catch(() => undefined);
    if (!fresh || fresh.actorId.toLowerCase() !== actorId || fresh.token === held.token)
      return response;
    held.token = fresh.token;
    copy.headers.set('Authorization', 'Bearer ' + fresh.token);
    return send(copy, init);
  };
}
