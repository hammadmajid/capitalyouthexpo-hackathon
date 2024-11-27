import { useQuery } from '@tanstack/react-query';
import { readCustomerStays } from '@hsm/api-client';
import type { StaySummary } from '@hsm/contracts';
import { actorClient } from '../../lib/runtime';

const residentStates = ['active', 'notice_given', 'checkout_pending'] as const;

export function isCurrentResidentStay(stay: StaySummary) {
  return (
    residentStates.some((state) => state === stay.state) &&
    stay.checkedInAt !== null &&
    stay.closedAt === null
  );
}

export function useCurrentResidentStay(actorId: string) {
  return useQuery({
    queryKey: ['private-stays', actorId, 'own', 'account-current'],
    retry: false,
    queryFn: async () => {
      const client = await actorClient(actorId);
      const pages = await Promise.all(
        residentStates.map((state) => readCustomerStays(client, { state, limit: 1 })),
      );
      return pages.flatMap((page) => page.data).some(isCurrentResidentStay);
    },
  });
}
