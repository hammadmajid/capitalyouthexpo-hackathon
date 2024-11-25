import { useQuery } from '@tanstack/react-query';
import { readInventoryAccess } from '@hsm/api-client';
import { browserClient } from './client';
export function useAdmissionAccess(actorId: string, branchId: string, unavailable: boolean) {
  const access = useQuery({
    queryKey: ['inventory-access', actorId, branchId],
    gcTime: 0,
    retry: false,
    enabled: !unavailable,
    queryFn: () => readInventoryAccess(browserClient(), branchId),
  });
  const permitted = (['stay_manage', 'rent_manage', 'finance_view'] as const).every((grant) =>
    access.data?.permissions.includes(grant),
  );
  const allowed =
    !unavailable && !access.isPending && !access.isFetching && !access.error && permitted;
  return { access, allowed, permitted };
}
