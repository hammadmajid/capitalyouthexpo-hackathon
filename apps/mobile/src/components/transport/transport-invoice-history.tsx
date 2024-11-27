import { Text, View } from 'react-native';
import { useInfiniteQuery, useQueries } from '@tanstack/react-query';
import { marketplacePrice, readStaffStayInvoice, readStaffStayInvoices } from '@hsm/api-client';
import { transportInvoiceState } from '@hsm/contracts';
import { mobileColors as colors } from '@hsm/ui';
import { actorClient } from '../../lib/runtime';
import { safeMessage } from '../../lib/messages';
import { formatDate, todayInKarachi } from '../date-field';
import { SetupButton } from '../owner-wizard-ui';
import { Skeleton } from '../loading/skeleton';
export function TransportInvoiceHistory({
  actorId,
  branchId,
  stayId,
  onPayment,
}: {
  actorId: string;
  branchId: string;
  stayId: string;
  onPayment: ((invoiceId: string) => void) | undefined;
}) {
  const key = ['private-invoices', actorId, branchId, stayId];
  const pages = useInfiniteQuery({
    queryKey: [...key, 'transport'],
    gcTime: 0,
    initialPageParam: '',
    queryFn: async ({ pageParam }) =>
      readStaffStayInvoices(await actorClient(actorId), branchId, stayId, {
        category: 'transport',
        limit: 10,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const invoices = pages.data?.pages.flatMap((page) => page.data) ?? [];
  const balances = useQueries({
    queries: invoices.map(({ invoiceId }) => ({
      queryKey: [...key, 'detail', invoiceId],
      gcTime: 0,
      queryFn: async () =>
        readStaffStayInvoice(await actorClient(actorId), branchId, stayId, invoiceId),
    })),
  });
  if (pages.isPending) return <Skeleton kind="list" label="Loading transport invoices" />;
  if (pages.isError)
    return <Text style={{ color: colors.dangerText }}>{safeMessage(pages.error)}</Text>;
  if (!invoices.length)
    return <Text style={{ color: colors.secondary }}>No transport invoices</Text>;
  return (
    <View style={{ gap: 8 }}>
      {invoices.map((invoice, index) => {
        const balance = balances[index];
        const bill = balance?.data;
        const labels = { due: 'Due', overdue: 'Overdue', paid: 'Paid', cleared: 'Cleared' };
        return (
          <View key={invoice.invoiceId} className="gap-2 border-t border-border py-2">
            <Text style={{ color: colors.heading }}>
              {invoice.invoiceNumber} · {formatDate(invoice.dueDate)}
            </Text>
            {invoice.documentState === 'voided' ? (
              <Text style={{ color: colors.secondary }}>Voided</Text>
            ) : bill ? (
              <>
                <Text style={{ color: colors.text }}>
                  {labels[transportInvoiceState(bill, todayInKarachi())]} ·{' '}
                  {marketplacePrice(bill.outstandingPaisa)} outstanding
                </Text>
                {onPayment && bill.outstandingPaisa > 0 ? (
                  <SetupButton
                    secondary
                    label={'Record payment for ' + invoice.invoiceNumber}
                    onPress={() => onPayment(invoice.invoiceId)}
                  />
                ) : null}
              </>
            ) : balance?.isError ? (
              <Text style={{ color: colors.dangerText }}>{safeMessage(balance.error)}</Text>
            ) : (
              <Skeleton kind="inline" label="Loading balance" />
            )}
          </View>
        );
      })}
      {pages.hasNextPage ? (
        <SetupButton
          secondary
          label="More transport invoices"
          disabled={pages.isFetchingNextPage}
          onPress={() => void pages.fetchNextPage()}
        />
      ) : null}
    </View>
  );
}
