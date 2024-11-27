import { useQueries, useQuery } from '@tanstack/react-query';
import { readStaffStayInvoice, readStaffStayInvoices } from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
import { billKinds } from './pay-bills';
import type { OpenBill } from './payment-plan';
// FIN-001 / SEC-003: the Stay's issued bills with their exact server balances, read with the
// actor-bound client. Only bills that still owe money are offered for payment.
export function useOpenBills(
  actorId: string,
  branchId: string,
  stayId: string,
  invoiceId?: string,
) {
  const key = ['private-invoices', actorId, branchId, stayId];
  const page = useQuery({
    queryKey: [...key, 'page', undefined],
    gcTime: 0,
    enabled: invoiceId === undefined,
    retry: false,
    queryFn: async () =>
      readStaffStayInvoices(await actorClient(actorId), branchId, stayId, { limit: 20 }),
  });
  const issued = invoiceId
    ? [{ invoiceId }]
    : (page.data?.data ?? []).filter((row) => row.documentState === 'issued');
  const details = useQueries({
    queries: issued.map((row) => ({
      queryKey: [...key, 'detail', row.invoiceId],
      gcTime: 0,
      retry: false,
      queryFn: async () =>
        readStaffStayInvoice(await actorClient(actorId), branchId, stayId, row.invoiceId),
    })),
  });
  const loading = (!invoiceId && page.isPending) || details.some((query) => query.isPending);
  const error =
    (invoiceId ? null : page.error) ?? details.find((query) => query.error)?.error ?? null;
  const bills: OpenBill[] = details
    .flatMap((query) => (query.data ? [query.data] : []))
    .filter((value) => value.outstandingPaisa > 0)
    .map((value) => ({
      invoiceId: value.invoiceId,
      dueDate: value.dueDate,
      outstandingPaisa: value.outstandingPaisa,
      label: value.lineItems
        ?.map((line) => billKinds[line.kind].name)
        .filter((name, index, names) => names.indexOf(name) === index)
        .join(' + '),
      overdue: value.state === 'overdue',
    }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return {
    bills,
    securityDuePaisa: Math.max(0, ...details.map((query) => query.data?.securityDuePaisa ?? 0)),
    securityPendingPaisa: Math.max(
      0,
      ...details.map((query) => query.data?.securityPendingPaisa ?? 0),
    ),
    loading,
    error,
    retry: () => (invoiceId ? void details[0]?.refetch() : void page.refetch()),
  };
}
