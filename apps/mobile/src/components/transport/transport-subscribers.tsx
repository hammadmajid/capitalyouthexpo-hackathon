import { useState } from 'react';
import { Text, View } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { decideTransport, marketplacePrice, readBranchTransport } from '@hsm/api-client';
import type { TransportSubscription } from '@hsm/contracts';
import { TransportInvoiceHistory } from './transport-invoice-history';
import { mobileColors as c } from '@hsm/ui';
import { actorClient } from '../../lib/runtime';
import { safeMessage } from '../../lib/messages';
import { useNativeCommand } from '../services/use-command';
import { NativeCommandRecovery } from '../services/command-recovery';
import { SetupButton, StatusChip } from '../owner-wizard-ui';
import { DateField, formatDate, todayInKarachi } from '../date-field';
import { Skeleton } from '../loading/skeleton';
import { TransportCard } from './transport-ui';
import { transportKeys } from './route-form';
import { StaffStayPayment } from '../staff-stay-payment';
const statusText: Record<TransportSubscription['status'], string> = {
  requested: 'Asked to join',
  active: 'Subscribed',
  ended: 'Ended',
  rejected: 'Declined',
  withdrawn: 'Withdrawn',
};
// SERV-002 / p.32: decisions need stay_manage + rent_manage (checked by the server); the
// effective date drives the shared billing schedule and cannot fall in an invoiced period.
export function TransportSubscribers({
  actorId,
  branchId,
  canDecide,
  canSeeBilling,
  canRecord,
  status = 'active',
}: {
  actorId: string;
  branchId: string;
  canDecide: boolean;
  canSeeBilling: boolean;
  canRecord: boolean;
  status?: 'active' | 'requested';
}) {
  const [payment, setPayment] = useState<{ stayId: string }>();
  const queue = useInfiniteQuery({
    queryKey: ['branch-transport', actorId, branchId, status],
    gcTime: 0,
    retry: false,
    initialPageParam: '',
    queryFn: async ({ pageParam }) =>
      readBranchTransport(await actorClient(actorId), branchId, {
        status,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const decide = useNativeCommand(
    'transport-decide:' + branchId,
    actorId,
    (client, body: { id: string; input: Record<string, unknown> }, key) =>
      decideTransport(client, branchId, body.id, body.input, key),
    [['branch-transport', actorId, branchId], ...transportKeys(actorId, branchId)],
  );
  if (queue.isError) return <Text style={{ color: c.dangerText }}>{safeMessage(queue.error)}</Text>;
  if (queue.isPending) return <Skeleton kind="list" label="Loading transport subscribers…" />;
  if (payment && canRecord)
    return (
      <StaffStayPayment
        actorId={actorId}
        branchId={branchId}
        {...payment}
        unavailable={false}
        onClose={() => setPayment(undefined)}
      />
    );
  const rows = queue.data.pages.flatMap((page) => page.data);
  return (
    <View style={{ gap: 10 }}>
      {canDecide ? <NativeCommandRecovery command={decide} /> : null}
      {decide.isError ? (
        <Text style={{ color: c.dangerText }}>{safeMessage(decide.error)}</Text>
      ) : null}
      {!rows.length ? (
        <Text style={{ color: c.secondary }}>
          {status === 'requested' ? 'No pending requests' : 'No transport subscribers'}
        </Text>
      ) : null}
      {rows.map((row) => (
        <Rider
          key={row.id}
          row={row}
          actorId={actorId}
          branchId={branchId}
          busy={decide.isPending}
          onPayment={canRecord ? () => setPayment({ stayId: row.stayId }) : undefined}
          decide={canDecide ? decide.mutate : undefined}
          canSeeBilling={canSeeBilling}
        />
      ))}
      {queue.hasNextPage ? (
        <SetupButton
          secondary
          label="Load more"
          disabled={queue.isFetchingNextPage}
          onPress={() => void queue.fetchNextPage()}
        />
      ) : null}
    </View>
  );
}
function Rider(props: {
  row: TransportSubscription;
  actorId: string;
  branchId: string;
  busy: boolean;
  canSeeBilling: boolean;
  decide: ((body: { id: string; input: Record<string, unknown> }) => void) | undefined;
  onPayment: ((invoiceId: string) => void) | undefined;
}) {
  const { row } = props;
  // Invoice state is shown only to finance readers (the server sends none to others).
  const billing = props.canSeeBilling ? row.billing : null;
  const [date, setDate] = useState(todayInKarachi());
  const [showInvoices, setShowInvoices] = useState(false);
  const send = (input: Record<string, unknown>) =>
    props.decide?.({ id: row.id, input: { expectedVersion: row.version, ...input } });
  return (
    <TransportCard>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ flex: 1, color: c.heading, fontWeight: '700' }}>
          {row.residentName ?? row.routeName}
        </Text>
        <Text style={{ color: c.primary, fontWeight: '700', fontSize: 13 }}>
          {statusText[row.status]}
        </Text>
      </View>
      <Text style={{ color: c.text }}>
        {marketplacePrice(row.monthlyChargePaisa)}/month
        {row.effectiveFrom ? ' · from ' + formatDate(row.effectiveFrom) : ''}
        {row.effectiveTo ? ' to ' + formatDate(row.effectiveTo) : ''}
      </Text>
      {billing ? (
        <View style={{ gap: 6 }}>
          <StatusChip
            label={
              { due: 'Due', overdue: 'Overdue', paid: 'Paid', cleared: 'Cleared' }[billing.state]
            }
            tone={
              ({ due: 'due', overdue: 'danger', paid: 'success', cleared: 'neutral' } as const)[
                billing.state
              ]
            }
          />
          <Text style={{ color: c.secondary }}>
            Due {formatDate(billing.dueDate)} · {marketplacePrice(billing.outstandingPaisa)}{' '}
            outstanding
          </Text>
          {props.onPayment && billing.outstandingPaisa > 0 ? (
            <SetupButton
              secondary
              label="Collect payment"
              onPress={() => props.onPayment?.(billing.invoiceId)}
            />
          ) : null}
        </View>
      ) : props.canSeeBilling && row.status === 'active' ? (
        <Text style={{ color: c.secondary }}>No invoice issued</Text>
      ) : null}
      {props.canSeeBilling && row.effectiveFrom ? (
        <SetupButton
          secondary
          label={showInvoices ? 'Hide transport invoices' : 'Transport invoices'}
          onPress={() => setShowInvoices(!showInvoices)}
        />
      ) : null}
      {showInvoices ? (
        <TransportInvoiceHistory
          actorId={props.actorId}
          branchId={props.branchId}
          stayId={row.stayId}
          onPayment={props.onPayment}
        />
      ) : null}
      {row.endRequestedAt && row.status === 'active' ? (
        <Text style={{ color: c.dangerText, fontSize: 13 }}>Resident asked to stop</Text>
      ) : null}
      {props.decide && (row.status === 'requested' || row.status === 'active') ? (
        <>
          <DateField
            label={row.status === 'requested' ? 'Start on' : 'Last day'}
            value={date}
            onChange={setDate}
            disabled={props.busy}
          />
          {row.status === 'requested' ? (
            <>
              <SetupButton
                label={'Approve ' + row.routeName}
                disabled={props.busy}
                onPress={() => send({ decision: 'approve', effectiveFrom: date })}
              />
              <SetupButton
                secondary
                label={'Decline ' + row.routeName}
                disabled={props.busy}
                onPress={() => send({ decision: 'reject', reason: 'Not available' })}
              />
            </>
          ) : (
            <SetupButton
              secondary
              label={'End ' + row.routeName}
              disabled={props.busy}
              onPress={() => send({ decision: 'end', effectiveTo: date })}
            />
          )}
        </>
      ) : null}
    </TransportCard>
  );
}
