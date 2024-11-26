'use client';
import { StaffStayPayment } from '../staff-stay-payment';
import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { TransportRouteDetails } from './transport-route-details';
import { transportSubscriptionStatusSchema, type TransportSubscription } from '@hsm/contracts';
import {
  decideTransport,
  marketplacePrice,
  readInventoryAccess,
  readTransportOverview,
  readBranchTransport,
  readStayRoutes,
  readStayTransport,
  requestTransport,
  residentTransportAction,
} from '@hsm/api-client';
import { browserClient } from '../../lib/client';
import { errorMessage } from '../../lib/messages';
import { Button } from '../ui/button';
import { useCommand } from './use-command';
import { CommandRecovery } from './command-recovery';
const statusLabel: Record<TransportSubscription['status'], string> = {
  requested: 'Requested — waiting for the hostel',
  active: 'Active',
  ended: 'Ended',
  rejected: 'Not approved',
  withdrawn: 'Withdrawn',
};
function period(row: TransportSubscription) {
  if (!row.effectiveFrom) return '';
  return ' · from ' + row.effectiveFrom + (row.effectiveTo ? ' to ' + row.effectiveTo : '');
}
// SERV-002: the resident sees each route's separate monthly charge before asking to join.
export function StayTransport({
  actorId,
  stayId,
  closed,
}: {
  actorId: string;
  stayId: string;
  closed: boolean;
}) {
  const routesKey = ['stay-routes', actorId, stayId],
    mineKey = ['stay-transport', actorId, stayId];
  const routes = useQuery({
    queryKey: routesKey,
    enabled: !closed,
    gcTime: 0,
    retry: false,
    queryFn: () => readStayRoutes(browserClient(), stayId),
  });
  const mine = useInfiniteQuery({
    queryKey: mineKey,
    gcTime: 0,
    retry: false,
    initialPageParam: '',
    queryFn: ({ pageParam }) =>
      readStayTransport(browserClient(), stayId, {
        limit: 50,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const ask = useCommand(
    'StayTransport:ask',
    (body: { monthlyChargePaisa: number }, key) =>
      requestTransport(browserClient(), stayId, body, key),
    [mineKey],
  );
  const act = useCommand(
    'StayTransport:act',
    (body: { id: string; act: 'withdraw' | 'end'; version: number }, key) =>
      residentTransportAction(
        browserClient(),
        stayId,
        body.id,
        body.act,
        { expectedVersion: body.version },
        key,
      ),
    [mineKey],
  );
  const history = mine.data?.pages.flatMap((page) => page.data) ?? [];
  const live = history.filter((row) => row.status === 'requested' || row.status === 'active');
  const [confirm, setConfirm] = useState(false);
  const offer = routes.data?.offer;
  return (
    <section aria-label="Transport" className="space-y-2">
      <CommandRecovery command={ask} />
      <CommandRecovery command={act} />
      <h4 className="font-semibold">Transport</h4>
      {mine.isPending || (!closed && routes.isPending) ? (
        <div aria-label="Loading transport" className="h-16 animate-pulse rounded-xl bg-hsm-icy" />
      ) : null}
      {ask.isError || act.isError || mine.isError || routes.isError ? (
        <p role="alert">{errorMessage(ask.error ?? act.error ?? mine.error ?? routes.error)}</p>
      ) : null}
      {history.map((row) => (
        <p key={row.id}>
          {row.routeName}: {statusLabel[row.status]} · {marketplacePrice(row.monthlyChargePaisa)}
          /month{period(row)}
          {row.endRequestedAt && row.status === 'active' ? ' · end requested' : ''}
        </p>
      ))}
      {!closed
        ? live.map((row) =>
            row.status === 'requested' || !row.endRequestedAt ? (
              <Button
                key={row.id}
                variant="secondary"
                disabled={act.isPending}
                onClick={() =>
                  act.mutate({
                    id: row.id,
                    act: row.status === 'requested' ? 'withdraw' : 'end',
                    version: row.version,
                  })
                }
              >
                {row.status === 'requested'
                  ? 'Withdraw transport request'
                  : 'Ask to stop transport'}{' '}
              </Button>
            ) : null,
          )
        : null}
      {!closed && offer?.mode === 'included' ? <p>Included in your rent</p> : null}
      {!closed && offer?.mode === 'separate' && !live.length ? (
        <div className="space-y-2">
          <p>{marketplacePrice(offer.monthlyChargePaisa)} per month, billed separately from rent</p>
          {confirm ? (
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={ask.isPending || !mine.isSuccess}
                onClick={() =>
                  ask.mutate(
                    { monthlyChargePaisa: offer.monthlyChargePaisa },
                    { onSuccess: () => setConfirm(false) },
                  )
                }
              >
                Confirm {marketplacePrice(offer.monthlyChargePaisa)}/month
              </Button>
              <Button variant="secondary" onClick={() => setConfirm(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button disabled={ask.isPending || !mine.isSuccess} onClick={() => setConfirm(true)}>
              Request transport
            </Button>
          )}
        </div>
      ) : null}
      {!closed && routes.isSuccess && !routes.data.data.length ? <p>No routes available.</p> : null}
      {!closed
        ? routes.data?.data.map((route) => (
            <TransportRouteDetails key={route.id} route={route} hidePrice />
          ))
        : null}
      {mine.hasNextPage ? (
        <Button
          variant="secondary"
          disabled={mine.isFetchingNextPage}
          onClick={() => void mine.fetchNextPage()}
        >
          More history
        </Button>
      ) : null}
    </section>
  );
}
// CHG-061 / SRS v2.42: Transport Operations shows subscribers, a status-filtered request queue
// with approve/reject and transport-only monthly fees. Routes are set up in Hostel Setup.
export function BranchTransport({ actorId, branchId }: { actorId: string; branchId: string }) {
  const [status, setStatus] = useState<TransportSubscription['status'] | ''>('');
  const queueKey = ['branch-transport', actorId, branchId, status];
  const access = useQuery({
    queryKey: ['transport-access', actorId, branchId],
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: 'always',
    queryFn: () => readInventoryAccess(browserClient(), branchId),
  });
  const grants = access.isSuccess && !access.isFetching ? access.data.permissions : [];
  // CHG-045: riders and decisions need stay_manage + rent_manage, or finance_view to read;
  // billing amounts stay finance-only (the server omits them otherwise).
  const canDecide = grants.includes('stay_manage') && grants.includes('rent_manage');
  const canReadRiders = grants.includes('finance_view') || canDecide;
  const overviewKey = ['transport-overview', actorId, branchId];
  const overview = useQuery({
    queryKey: overviewKey,
    queryFn: () => readTransportOverview(browserClient(), branchId),
    gcTime: 0,
    retry: false,
  });
  const queue = useInfiniteQuery({
    queryKey: queueKey,
    enabled: canReadRiders,
    gcTime: 0,
    retry: false,
    initialPageParam: '',
    queryFn: ({ pageParam }) =>
      readBranchTransport(browserClient(), branchId, {
        ...(status ? { status } : {}),
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const [payStay, setPayStay] = useState<string>();
  const canRecord = grants.includes('finance_view') && grants.includes('payment_record');
  const [date, setDate] = useState('');
  const decide = useCommand(
    'BranchTransport:decide',
    (body: { id: string; input: Record<string, unknown> }, key) =>
      decideTransport(browserClient(), branchId, body.id, body.input, key),
    [['branch-transport', actorId, branchId], overviewKey],
  );
  return (
    <section aria-label="Transport management" className="space-y-2">
      <CommandRecovery command={decide} />
      <h3 className="font-semibold">Transport</h3>
      {decide.isError ? <p role="alert">{errorMessage(decide.error)}</p> : null}
      {access.isError ? <p role="alert">{errorMessage(access.error)}</p> : null}
      {overview.isSuccess ? (
        <p>
          {overview.data.activeSubscribers} transport subscribers · {overview.data.pendingRequests}{' '}
          requests
          {overview.data.monthlyChargesPaisa !== null
            ? ' · ' +
              marketplacePrice(overview.data.monthlyChargesPaisa) +
              ' monthly transport fees'
            : ''}
        </p>
      ) : null}
      {canReadRiders ? (
        <label className="field-label">
          Show
          <select
            aria-label="Transport request status"
            className="field-input"
            value={status}
            onChange={(event) => {
              const next = transportSubscriptionStatusSchema.safeParse(event.target.value);
              setStatus(next.success ? next.data : '');
            }}
          >
            <option value="">All subscribers and requests</option>
            {transportSubscriptionStatusSchema.options.map((value) => (
              <option key={value} value={value}>
                {statusLabel[value]}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {canDecide ? (
        <label className="field-label">
          Effective date for decisions
          <input
            aria-label="Transport effective date"
            type="date"
            className="field-input"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
      ) : null}
      {canReadRiders && queue.isSuccess
        ? queue.data.pages
            .flatMap((page) => page.data)
            .map((row) => (
              <div key={row.id} className="space-y-1 rounded-xl border border-border p-3">
                <p>
                  {row.residentName ?? row.routeName}: {statusLabel[row.status]} ·{' '}
                  {marketplacePrice(row.monthlyChargePaisa)}
                  /month{period(row)}
                  {row.endRequestedAt && row.status === 'active' ? ' · resident asked to stop' : ''}
                </p>
                {row.billing ? (
                  <p
                    className={
                      row.billing.state === 'overdue'
                        ? 'text-red-700'
                        : row.billing.state === 'due'
                          ? 'text-amber-700'
                          : 'text-emerald-800'
                    }
                  >
                    {
                      { due: 'Due', overdue: 'Overdue', paid: 'Paid', cleared: 'Cleared' }[
                        row.billing.state
                      ]
                    }{' '}
                    · {row.billing.dueDate} · {marketplacePrice(row.billing.outstandingPaisa)}{' '}
                    outstanding
                  </p>
                ) : null}
                {canRecord && row.effectiveFrom ? (
                  <Button variant="secondary" onClick={() => setPayStay(row.id)}>
                    Transport payments for {row.residentName ?? row.routeName}
                  </Button>
                ) : null}
                {canRecord && payStay === row.id && row.effectiveFrom ? (
                  <StaffStayPayment
                    actorId={actorId}
                    branchId={branchId}
                    stayId={row.stayId}
                    unavailable={false}
                    transportOnly
                    onClose={() => setPayStay(undefined)}
                  />
                ) : null}
                {canDecide && row.status === 'requested' ? (
                  <>
                    <Button
                      disabled={!date || decide.isPending}
                      onClick={() =>
                        decide.mutate({
                          id: row.id,
                          input: {
                            decision: 'approve',
                            expectedVersion: row.version,
                            effectiveFrom: date,
                          },
                        })
                      }
                    >
                      Approve transport from date
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={decide.isPending}
                      onClick={() =>
                        decide.mutate({
                          id: row.id,
                          input: {
                            decision: 'reject',
                            expectedVersion: row.version,
                            reason: 'Not available',
                          },
                        })
                      }
                    >
                      Decline transport request
                    </Button>
                  </>
                ) : null}
                {canDecide && row.status === 'active' ? (
                  <Button
                    variant="secondary"
                    disabled={!date || decide.isPending}
                    onClick={() =>
                      decide.mutate({
                        id: row.id,
                        input: { decision: 'end', expectedVersion: row.version, effectiveTo: date },
                      })
                    }
                  >
                    End transport on date
                  </Button>
                ) : null}
              </div>
            ))
        : null}
      {canReadRiders && queue.hasNextPage ? (
        <Button
          variant="secondary"
          disabled={queue.isFetchingNextPage}
          onClick={() => void queue.fetchNextPage()}
        >
          More riders
        </Button>
      ) : null}
    </section>
  );
}
