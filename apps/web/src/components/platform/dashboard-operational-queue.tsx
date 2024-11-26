'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { readDashboardQueue, marketplacePrice } from '@hsm/api-client';
import type { DashboardQueueKind } from '@hsm/contracts';
import { browserClient } from '../../lib/client';
import { errorMessage } from '../../lib/messages';
import { Button } from '../ui/button';
import { InvoiceBalance } from '../stay-invoices';
import { BranchComplaints, complaintLabel } from '../services/complaints';
import { StayRecordPanel } from '../stay-record';
import { StayLifecycle } from '../stay-lifecycle';
type Props = {
  actorId: string;
  branchId: string;
  queue: DashboardQueueKind;
  permissions: readonly string[];
};
export function DashboardOperationalQueue({ actorId, branchId, queue, permissions }: Props) {
  const [cursor, setCursor] = useState<string>(),
    [selected, setSelected] = useState<string>(),
    [locked, setLocked] = useState(false);
  const result = useQuery({
    queryKey: ['dashboard-queue', actorId, branchId, queue, cursor],
    gcTime: 0,
    retry: false,
    queryFn: () =>
      readDashboardQueue(browserClient(), branchId, queue, {
        limit: 20,
        ...(cursor ? { cursor } : {}),
      }),
  });
  if (result.error)
    return (
      <div>
        <p role="alert">{errorMessage(result.error)}</p>
        <Button onClick={() => void result.refetch()}>Retry operational queue</Button>
      </div>
    );
  if (!result.data) return <p role="status">Loading operational queue…</p>;
  const page = result.data;
  return (
    <section aria-label="Operational queue" className="space-y-3">
      <p>As of {page.asOf} (Asia/Karachi)</p>
      <fieldset
        className="min-w-0 space-y-3"
        disabled={result.isFetching}
        hidden={result.isFetching}
      >
        {!page.data.length ? <p>No items are waiting in this queue.</p> : null}
        {page.queue === 'overdue'
          ? page.data.map((row) => (
              <article key={row.balance.invoiceId} className="space-y-2">
                <p>
                  {row.displayName} · {row.balance.invoiceNumber} · Due {row.balance.dueDate} ·
                  Outstanding {marketplacePrice(row.balance.outstandingPaisa)}
                </p>
                <Button disabled={locked} onClick={() => setSelected(row.balance.invoiceId)}>
                  View overdue invoice {row.balance.invoiceNumber}
                </Button>
                {selected === row.balance.invoiceId ? (
                  <InvoiceBalance value={row.balance} onClose={() => setSelected(undefined)} />
                ) : null}
              </article>
            ))
          : page.queue === 'complaints'
            ? page.data.map((row) => (
                <article key={row.id} className="space-y-2">
                  <p>
                    {row.residentName} · {row.title} · {complaintLabel[row.status]}
                  </p>
                  <Button disabled={locked} onClick={() => setSelected(row.id)}>
                    Open complaint {row.title}
                  </Button>
                  {selected === row.id ? (
                    <BranchComplaints
                      key={row.id}
                      actorId={actorId}
                      branchId={branchId}
                      staffUserId={actorId}
                      complaintId={row.id}
                      onLockChange={setLocked}
                    />
                  ) : null}
                </article>
              ))
            : page.data.map((row) => (
                <article key={row.id} className="space-y-2">
                  <p>
                    {row.displayName} · {row.state.replaceAll('_', ' ')} · Expected departure{' '}
                    {row.expectedLeaveDate ?? 'Open-ended'}
                  </p>
                  <Button disabled={locked} onClick={() => setSelected(row.id)}>
                    Open checkout for {row.displayName}
                  </Button>
                  {selected === row.id ? (
                    <div>
                      <StayRecordPanel actorId={actorId} branchId={branchId} stayId={row.id} />
                      <StayLifecycle
                        key={row.id}
                        actorId={actorId}
                        branchId={branchId}
                        stayId={row.id}
                        version={row.version}
                        closed={false}
                        permissions={permissions}
                        onLockChange={setLocked}
                      />
                    </div>
                  ) : null}
                </article>
              ))}
        {selected ? (
          <Button variant="secondary" disabled={locked} onClick={() => setSelected(undefined)}>
            Close queue item
          </Button>
        ) : null}
        {page.nextCursor ? (
          <Button
            disabled={locked || Boolean(selected)}
            onClick={() => {
              setSelected(undefined);
              setCursor(page.nextCursor ?? undefined);
            }}
          >
            Next queue items
          </Button>
        ) : null}
        {cursor ? (
          <Button
            variant="secondary"
            disabled={locked || Boolean(selected)}
            onClick={() => {
              setSelected(undefined);
              setCursor(undefined);
            }}
          >
            First queue items
          </Button>
        ) : null}
      </fieldset>
      {result.isFetching ? <p role="status">Refreshing operational queue…</p> : null}
    </section>
  );
}
