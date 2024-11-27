import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '../providers';
import { adminSignature, canUseAdmin } from '../../lib/admin-access';

// No Admin event stream exists. One quiet foreground check covers changes from
// other sessions; local commands and navigation synchronize immediately.
export const ADMIN_SYNC_MS = 60_000;
export function useAdminSynchronization(boundary: boolean) {
  const cache = useQueryClient();
  const profile = useSession().profile;
  const actorId = profile?.user.id;
  const signature = adminSignature(profile);
  const allowed = canUseAdmin(profile);
  useEffect(() => {
    if (!boundary || !allowed || !actorId) return;
    const key = ['platform-admin', actorId, signature];
    const timer = setInterval(() => {
      if (AppState.currentState !== 'active' || cache.isMutating({ mutationKey: key })) return;
      void cache.invalidateQueries({
        queryKey: key,
        predicate: (query) =>
          query.isActive() &&
          query.state.fetchStatus === 'idle' &&
          query.state.status === 'success' &&
          query.queryKey[3] !== 'overview-lifetime-start',
      });
    }, ADMIN_SYNC_MS);
    return () => clearInterval(timer);
  }, [boundary, allowed, actorId, signature, cache]);
}
