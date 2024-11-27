import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { ClientFailure, type ApiClient } from '@hsm/api-client';
import { actorClient } from '../../lib/runtime';
import { adminSignature } from '../../lib/admin-access';
import { moduleAllowed, type AdminModule } from '../../lib/admin-modules';
import { useAdminData } from './data';
// COMM-002 / TRUST-002: explicit audited access, never an automatic query or retry.
export function useSensitiveRead<T, R>(
  module: AdminModule,
  run: (client: ApiClient, input: T) => Promise<R>,
) {
  const data = useAdminData();
  const epoch = useRef(0);
  const mutation = useMutation({
    mutationKey: [...data.key, module, 'sensitive'],
    retry: false,
    gcTime: 0,
    mutationFn: async (input: T) => {
      const ticket = epoch.current;
      const fresh = await data.session.refetch();
      if (!moduleAllowed(fresh, module) || adminSignature(fresh) !== adminSignature(data.profile))
        throw new ClientFailure('INVALID_RESPONSE');
      const result = await run(await actorClient(data.actorId), input);
      const current = await data.session.refetch();
      if (
        ticket !== epoch.current ||
        !moduleAllowed(current, module) ||
        adminSignature(current) !== adminSignature(data.profile)
      )
        throw new ClientFailure('INVALID_RESPONSE');
      return result;
    },
  });
  const reset = useRef(mutation.reset);
  reset.current = mutation.reset;
  useFocusEffect(
    useCallback(() => {
      epoch.current += 1;
      return () => {
        epoch.current += 1;
        reset.current();
      };
    }, []),
  );
  return mutation;
}
