'use client';
import { useState } from 'react';
import { formatExactMoney, moneyFromJson } from '@hsm/contracts';
import { useStayInvoices } from '../lib/use-stay-invoices';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
export function PaymentInvoiceChoices(props: {
  actorId: string;
  branchId: string;
  stayId: string;
  transportOnly?: boolean;
  chosen: string[];
  onChoose: (id: string, label: string) => void;
}) {
  const [cursor, setCursor] = useState<string>(),
    [selected, setSelected] = useState<string>(),
    state = useStayInvoices({ ...props, canView: true }, true, cursor, selected);
  if (state.error)
    return (
      <div className="space-y-2">
        <p role="alert">{errorMessage(state.error)}</p>
        <Button
          onClick={() => {
            setSelected(undefined);
            void state.page.refetch();
          }}
        >
          Retry allocation invoices
        </Button>
      </div>
    );
  if (!state.fresh) return <p role="status">Loading current allocation invoices…</p>;
  return (
    <section aria-label="Choose invoice allocations" className="space-y-2">
      <h5 className="font-semibold">Choose invoice allocations</h5>
      {!state.page.data?.data.length ? (
        <p>No invoices on this page.</p>
      ) : (
        <ul>
          {state.page.data.data.map((row) => (
            <li key={row.invoiceId}>
              <p>
                {row.invoiceNumber} · Due {row.dueDate} · {row.documentState}
              </p>
              <Button
                variant="secondary"
                disabled={
                  row.documentState !== 'issued' ||
                  props.chosen.includes(row.invoiceId) ||
                  props.chosen.length >= 100
                }
                onClick={() => {
                  setSelected(row.invoiceId);
                  props.onChoose(row.invoiceId, row.invoiceNumber);
                }}
              >
                Allocate to {row.invoiceNumber}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <InvoiceBalanceHint state={state} />
      {state.page.data?.nextCursor ? (
        <Button
          onClick={() => {
            setSelected(undefined);
            setCursor(state.page.data?.nextCursor ?? undefined);
          }}
        >
          Next allocation invoices
        </Button>
      ) : null}
      {cursor ? (
        <Button
          variant="secondary"
          onClick={() => {
            setSelected(undefined);
            setCursor(undefined);
          }}
        >
          First allocation invoices
        </Button>
      ) : null}
    </section>
  );
}
function InvoiceBalanceHint({ state }: { state: ReturnType<typeof useStayInvoices> }) {
  if (!state.visibleId) return null;
  if (state.detail.isPending || state.detail.isFetching)
    return <p role="status">Loading current invoice balance…</p>;
  return state.detail.data ? (
    <p>
      Current outstanding for {state.detail.data.invoiceNumber}:{' '}
      {formatExactMoney(moneyFromJson(state.detail.data.outstandingPaisa))}
    </p>
  ) : null;
}
