import { bindActorClient, createActorClientBinder } from './actor-client';
import { createApiClient, ClientFailure } from '@hsm/api-client';
import { timedFetch } from './fetch';
import { validateMobileConfig } from './config';
import { vault } from './secure-store';
import { MobileSessionManager } from './session';
export const config = validateMobileConfig({
  environment: process.env.EXPO_PUBLIC_APP_ENV ?? 'development',
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000',
  webUrl: process.env.EXPO_PUBLIC_WEB_URL ?? 'http://localhost:3000',
});
export const client = createApiClient({
  baseUrl: config.apiUrl,
  authentication: { kind: 'bearer', accessToken: async () => (await vault.read())?.accessToken },
  fetch: timedFetch((request, init) => fetch(request, init)),
});
// Refresh rotates the token server-side; giving up early and resending the old token would end
// every session (reuse detection), so session calls wait longer than ordinary reads.
const sessionClient = createApiClient({
  baseUrl: config.apiUrl,
  authentication: { kind: 'bearer', accessToken: async () => (await vault.read())?.accessToken },
  fetch: timedFetch((request, init) => fetch(request, init), 45_000),
});
export const sessions = new MobileSessionManager(sessionClient, vault);

export const actorClient = createActorClientBinder({
  baseUrl: config.apiUrl,
  accessToken: async () => (await vault.read())?.accessToken,
  fetch: timedFetch((request, init) => fetch(request, init)),
  // Serialized refresh; the profile it returns proves whose token the vault now holds.
  renew: async () => {
    const profile = await sessions.restore();
    const token = (await vault.read())?.accessToken;
    return profile && token ? { actorId: profile.user.id, token } : undefined;
  },
});
export async function actorRealtimeToken(actorId: string) {
  const profile = await sessions.restore();
  if (profile?.user.id !== actorId) throw new ClientFailure('INVALID_RESPONSE');
  const token = (await vault.read())?.accessToken;
  if (!token) throw new ClientFailure('INVALID_RESPONSE');
  await bindActorClient(
    {
      baseUrl: config.apiUrl,
      accessToken: async () => token,
      fetch: timedFetch((request, init) => fetch(request, init)),
    },
    actorId,
  );
  return token;
}
