import { useQuery } from '@tanstack/react-query';
import {
  readCustomerStayInvoices,
  readCustomerStayInvoice,
  readStaffStayInvoices,
  readStaffStayInvoice,
} from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
// FIN-001 / SEC-003: reuse parent scope; every read still requires a bound actor client.
export function useStayInvoices(
  props: { actorId: string; branchId?: string; stayId: string; canView: boolean },
  open: boolean,
  cursor: string | undefined,
  selected: string | undefined,
) {
  const key = ['private-invoices', props.actorId, props.branchId ?? 'own', props.stayId],
    enabled = open && props.canView;
  const page = useQuery({
    queryKey: [...key, 'page', cursor],
    gcTime: 0,
    retry: false,
    enabled,
    queryFn: async () => {
      const client = await actorClient(props.actorId),
        query = { limit: 20, ...(cursor ? { cursor } : {}) };
      return props.branchId
        ? readStaffStayInvoices(client, props.branchId, props.stayId, query)
        : readCustomerStayInvoices(client, props.stayId, query);
    },
  });
  const fresh = enabled && !page.isPending && !page.isFetching && !page.error;
  const visibleId =
    fresh && page.data?.data.some((row) => row.invoiceId === selected) ? selected : undefined;
  const detail = useQuery({
    queryKey: [...key, 'detail', visibleId],
    gcTime: 0,
    retry: false,
    enabled: visibleId !== undefined,
    queryFn: async () => {
      const client = await actorClient(props.actorId);
      return props.branchId
        ? readStaffStayInvoice(client, props.branchId, props.stayId, visibleId ?? '')
        : readCustomerStayInvoice(client, props.stayId, visibleId ?? '');
    },
  });
  return { page, detail, fresh, visibleId, error: page.error ?? detail.error };
}
