'use client';
import { useQueries, useQuery } from '@tanstack/react-query';
import {
  ownStayPaymentSummary,
  ownStayPaymentProofs,
  readCustomerStayInvoice,
  readCustomerStayInvoices,
} from '@hsm/api-client';
import { browserClient } from '../lib/client';

export function usePaymentObligations(actorId: string, stayId: string, enabled: boolean) {
  const security = useQuery({
    queryKey: ['own-payment-summary', actorId, stayId],
    enabled,
    gcTime: 0,
    retry: false,
    queryFn: () => ownStayPaymentSummary(browserClient(), stayId),
  });
  const invoices = useQuery({
    queryKey: ['own-invoice-references', actorId, stayId],
    enabled,
    gcTime: 0,
    retry: false,
    queryFn: () => readCustomerStayInvoices(browserClient(), stayId, { limit: 50 }),
  });
  const pending = useQuery({
    queryKey: ['own-payment-proofs', actorId, stayId, 'pending'],
    enabled,
    gcTime: 0,
    retry: false,
    queryFn: () => ownStayPaymentProofs(browserClient(), stayId, { state: 'submitted', limit: 50 }),
  });
  const issued = invoices.data?.data.filter((row) => row.documentState === 'issued') ?? [];
  const balances = useQueries({
    queries: issued.map((row) => ({
      queryKey: ['own-invoice-balance', actorId, stayId, row.invoiceId],
      enabled,
      gcTime: 0,
      retry: false,
      queryFn: () => readCustomerStayInvoice(browserClient(), stayId, row.invoiceId),
    })),
  });
  const blocked = new Set(
    (pending.data?.data ?? [])
      .filter((proof) => proof.state === 'submitted')
      .flatMap(
        (proof) =>
          proof.invoices?.map((bill) => bill.invoiceId) ??
          (proof.invoiceId ? [proof.invoiceId] : []),
      ),
  );
  const bills = issued.flatMap((row, index) => {
    const balance = balances[index]?.data;
    if (
      !balance ||
      blocked.has(row.invoiceId) ||
      !['issued', 'partially_paid', 'overdue'].includes(balance.state)
    )
      return [];
    return [{ ...row, outstandingPaisa: balance.outstandingPaisa }];
  });
  return {
    security,
    bills,
    loading:
      security.isPending ||
      invoices.isPending ||
      pending.isPending ||
      balances.some((row) => row.isPending),
    error:
      security.error ?? invoices.error ?? pending.error ?? balances.find((row) => row.error)?.error,
  };
}
