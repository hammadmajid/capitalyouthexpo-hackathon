'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { RentBoardState } from '@hsm/contracts';
import { marketplacePrice, readInventoryAccess, readRentBoard } from '@hsm/api-client';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
// RB-001/002: status is always written out; before due date and grace an unpaid invoice is
// neutral "Issued", only past grace is "Overdue". Colour is only a supplementary cue.
const labels: Record<RentBoardState, { text: string; tone: string }> = {
  proof_pending: { text: 'Action needed: proof pending review', tone: 'border-hsm-gold' },
  overdue: { text: 'Overdue', tone: 'border-hsm-dangerText' },
  partially_paid: { text: 'Partially paid', tone: 'border-hsm-gold' },
  issued: { text: 'Issued (not yet overdue)', tone: 'border-hsm-border' },
  paid: { text: 'Paid', tone: 'border-hsm-success' },
  no_charge: { text: 'No charge', tone: 'border-hsm-border' },
  voided: { text: 'Voided', tone: 'border-hsm-border' },
  not_billed: { text: 'Not billed this month', tone: 'border-hsm-border' },
};
export function RentBoard(props: { actorId: string; branchId: string }) {
  return <Board key={props.actorId + ':' + props.branchId} {...props} />;
}
function Board({ actorId, branchId }: { actorId: string; branchId: string }) {
  const [open, setOpen] = useState(false),
    [month, setMonth] = useState(''),
    [cursors, setCursors] = useState<string[]>([]);
  const access = useQuery({
    queryKey: ['inventory-access', actorId, branchId],
    gcTime: 0,
    queryFn: () => readInventoryAccess(browserClient(), branchId),
  });
  const cursor = cursors.at(-1);
  const board = useQuery({
    queryKey: ['rent-board', actorId, branchId, month, cursor],
    enabled: open,
    gcTime: 0,
    retry: false,
    queryFn: () =>
      readRentBoard(browserClient(), branchId, {
        ...(month ? { month } : {}),
        ...(cursor ? { cursor } : {}),
      }),
  });
  if (!access.data?.permissions.includes('finance_view')) return null;
  if (!open)
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        View Rent Board
      </Button>
    );
  const page = board.data;
  return (
    <section aria-label="Rent Board" className="space-y-4">
      <h2 className="text-xl font-semibold">Rent Board{page ? ' — ' + page.month : ''}</h2>
      <label className="field-label">
        Billing month (blank for current)
        <input
          type="month"
          aria-label="Billing month"
          value={month}
          onChange={(event) => {
            setMonth(event.target.value);
            setCursors([]);
          }}
        />
      </label>
      {board.isPending ? <p role="status">Loading Rent Board…</p> : null}
      {board.isError ? <p role="alert">{errorMessage(board.error)}</p> : null}
      {page ? (
        <>
          {page.data.length === 0 ? <p>No resident Stays in this month.</p> : null}
          <ul className="space-y-3">
            {page.data.map((row) => (
              <li
                key={row.stayId}
                className={'rounded-input border-l-4 p-3 ' + labels[row.state].tone}
              >
                <p className="font-medium">
                  {row.displayName}
                  {row.roomLabel ? ' · Room ' + row.roomLabel : ''}
                  {row.bedLabel ? ', Bed ' + row.bedLabel : ''}
                </p>
                <p>Status: {labels[row.state].text}</p>
                {row.pendingProofs > 0 ? (
                  <p>{row.pendingProofs} payment proof(s) awaiting review</p>
                ) : null}
                <ul>
                  {row.invoices.map((invoice) => (
                    <li key={invoice.invoiceId}>
                      {invoice.invoiceNumber}: due {invoice.dueDate} (grace {invoice.graceDays}{' '}
                      days) · total {marketplacePrice(invoice.totalPaisa)} · outstanding{' '}
                      {marketplacePrice(invoice.outstandingPaisa)} · {labels[invoice.state].text}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            {cursors.length > 0 ? (
              <Button variant="secondary" onClick={() => setCursors(cursors.slice(0, -1))}>
                Previous Stays
              </Button>
            ) : null}
            {page.nextCursor ? (
              <Button
                variant="secondary"
                onClick={() => setCursors([...cursors, page.nextCursor ?? ''])}
              >
                Next Stays
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
      <Button variant="secondary" disabled={board.isFetching} onClick={() => void board.refetch()}>
        Refresh Rent Board
      </Button>
      <Button variant="ghost" onClick={() => setOpen(false)}>
        Close Rent Board
      </Button>
    </section>
  );
}
