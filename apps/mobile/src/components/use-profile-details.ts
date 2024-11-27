import { useQuery } from '@tanstack/react-query';
import { readProfileDetails } from '@hsm/api-client';
import { client } from '../lib/runtime';
export function useProfileDetails(userId: string | undefined, verified: boolean) {
  return useQuery({
    queryKey: ['private-profile-details', userId],
    queryFn: () => {
      if (!userId) throw new Error('Identity unavailable');
      return readProfileDetails(client, userId);
    },
    enabled: Boolean(userId) && verified,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
