import { useQuery } from '@tanstack/react-query';
import {
  readCustomerStayInvoices,
  readCustomerStayInvoice,
  readStaffStayInvoices,
  readStaffStayInvoice,
} from '@hsm/api-client';
import { browserClient } from './client';
// FIN-001 / SEC-003: access comes from the actual parent's current scoped read.
// The API independently rechecks self linkage or live finance_view on every request.
export function useStayInvoices(
  props: {
    actorId: string;
    branchId?: string;
    stayId: string;
    canView: boolean;
    transportOnly?: boolean;
  },
  open: boolean,
  cursor: string | undefined,
  selected: string | undefined,
) {
  const key = ['private-invoices', props.actorId, props.branchId ?? 'own', props.stayId],
    enabled = open && props.canView;
  const page = useQuery({
    queryKey: [...key, 'page', cursor, props.transportOnly ? 'transport' : 'all'],
    gcTime: 0,
    retry: false,
    enabled,
    queryFn: () => {
      const query = { limit: 20, ...(cursor ? { cursor } : {}) };
      return props.branchId
        ? readStaffStayInvoices(browserClient(), props.branchId, props.stayId, {
            ...query,
            ...(props.transportOnly ? { category: 'transport' } : {}),
          })
        : readCustomerStayInvoices(browserClient(), props.stayId, query);
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
    queryFn: () =>
      props.branchId
        ? readStaffStayInvoice(browserClient(), props.branchId, props.stayId, visibleId ?? '')
        : readCustomerStayInvoice(browserClient(), props.stayId, visibleId ?? ''),
  });
  return { page, detail, fresh, visibleId, error: page.error ?? detail.error };
}
