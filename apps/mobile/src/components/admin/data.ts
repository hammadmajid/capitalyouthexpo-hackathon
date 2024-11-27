import { useAdminQueryActivity } from './query-activity';
import { useQueryClient } from '@tanstack/react-query';
import { ApiFailure, ClientFailure, readOwnAdmin } from '@hsm/api-client';
import { useSession } from '../providers';
import { useNativeCommand } from '../services/use-command';
import { actorClient } from '../../lib/runtime';
import { withFreshSession } from '../../lib/fresh-session';
import { adminSignature, canUseAdmin } from '../../lib/admin-access';
import { clearAdminCache } from '../../lib/admin-cache';
import type { ApiClient } from '@hsm/api-client';
import { moduleAllowed, type AdminModule } from '../../lib/admin-modules';
function requireActiveRead(signal?: AbortSignal) {
  // Hermes' AbortSignal supports aborted, but not every DOM convenience method.
  if (!signal?.aborted) return;
  const error = new Error('Admin read cancelled');
  error.name = 'AbortError';
  throw error;
}
export function useAdminData() {
  const session = useSession();
  const active = useAdminQueryActivity();
  const cache = useQueryClient();
  const profile = session.profile;
  const actorId = profile?.user.id ?? '';
  const scope = adminSignature(profile);
  const key = ['platform-admin', actorId, scope] as const;
  async function read<T>(
    work: (client: ApiClient) => Promise<T>,
    signal?: AbortSignal,
    staff = true,
  ) {
    try {
      requireActiveRead(signal);
      const result = await withFreshSession(async () => work(await actorClient(actorId)));
      const fresh = await session.refetch();
      if (
        fresh?.user.id !== actorId ||
        (staff && (!canUseAdmin(fresh) || adminSignature(fresh) !== scope))
      )
        throw new ClientFailure('INVALID_RESPONSE');
      requireActiveRead(signal);
      return result;
    } catch (error) {
      if (
        error instanceof ApiFailure &&
        ['FORBIDDEN', 'SESSION_REVOKED', 'ACCOUNT_SUSPENDED'].includes(error.code)
      ) {
        clearAdminCache(cache);
        void session.refetch();
      }
      throw error;
    }
  }
  return { session, profile, actorId, key, read, active };
}
export function useOwnAdmin() {
  const data = useAdminData();
  return { ...data, load: (signal?: AbortSignal) => data.read(readOwnAdmin, signal, false) };
}
export function useAdminCommand<T>(
  operation: string,
  run: (client: ApiClient, body: T, key: string) => Promise<unknown>,
  rootOnly = false,
  module?: AdminModule,
) {
  const data = useAdminData();
  const command = useNativeCommand(
    operation,
    data.actorId,
    async (client, body: T, key) => {
      const fresh = await data.session.refetch();
      if (
        fresh?.user.id !== data.actorId ||
        !canUseAdmin(fresh, rootOnly) ||
        (module !== undefined && !moduleAllowed(fresh, module)) ||
        adminSignature(fresh) !== adminSignature(data.profile)
      )
        throw new ClientFailure('INVALID_RESPONSE');
      const result = await run(client, body, key);
      await data.session.refetch();
      return result;
    },
    [data.key],
    data.key,
  );
  return command;
}
