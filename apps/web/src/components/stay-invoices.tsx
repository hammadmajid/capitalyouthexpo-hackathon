'use client';
import { useState } from 'react';
import { formatExactMoney, moneyFromJson, type ResidentInvoiceBalance } from '@hsm/contracts';
import { useStayInvoices } from '../lib/use-stay-invoices';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
import { BillReissue } from './residents/bill-reissue';
type Props = { actorId: string; branchId?: string; stayId: string; canView: boolean };
type State = ReturnType<typeof useStayInvoices>;
export function StayInvoices(props: Props) {
  return (
    <Invoices
      key={props.actorId + ':' + (props.branchId ?? 'own') + ':' + props.stayId}
      {...props}
    />
  );
}
function Invoices(props: Props) {
  const [open, setOpen] = useState(false),
    [cursor, setCursor] = useState<string>(),
    [selected, setSelected] = useState<string>();
  const state = useStayInvoices(props, open, cursor, selected);
  if (!props.canView) return null;
  function reset() {
    setSelected(undefined);
    setCursor(undefined);
  }
  function refresh() {
    setSelected(undefined);
    void state.page.refetch();
  }
  if (!open)
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        View invoices
      </Button>
    );
  return (
    <section
      aria-label="Stay invoices"
      className="space-y-3 rounded-input border border-hsm-border p-4"
    >
      <h4 className="font-semibold">Invoices</h4>
      <Button
        variant="ghost"
        onClick={() => {
          reset();
          setOpen(false);
        }}
      >
        Close invoices
      </Button>
      <InvoiceContent state={state} onSelect={setSelected} onRefresh={refresh} />
      {props.branchId && state.visibleId && state.detail.data && !state.detail.isFetching ? (
        <BillReissue
          key={state.detail.data.invoiceId}
          actorId={props.actorId}
          branchId={props.branchId}
          stayId={props.stayId}
          balance={state.detail.data}
        />
      ) : null}
      {state.fresh && !state.error ? (
        <InvoicePages
          state={state}
          hasPrevious={Boolean(cursor)}
          onFirst={reset}
          onNext={() => {
            setSelected(undefined);
            setCursor(state.page.data?.nextCursor ?? undefined);
          }}
        />
      ) : null}
      <Button variant="secondary" disabled={state.page.isFetching} onClick={refresh}>
        Refresh invoices
      </Button>
    </section>
  );
}
function InvoiceContent({
  state,
  onSelect,
  onRefresh,
}: {
  state: State;
  onSelect: (id: string | undefined) => void;
  onRefresh: () => void;
}) {
  if (state.error)
    return (
      <>
        <p role="alert">{errorMessage(state.error)}</p>
        <Button onClick={onRefresh}>Retry invoices</Button>
      </>
    );
  if (!state.fresh) return <p role="status">Loading invoices…</p>;
  return (
    <>
      <InvoiceReferences state={state} onSelect={onSelect} />
      <SelectedInvoice state={state} onClose={() => onSelect(undefined)} />
    </>
  );
}
function InvoicePages({
  state,
  hasPrevious,
  onFirst,
  onNext,
}: {
  state: State;
  hasPrevious: boolean;
  onFirst: () => void;
  onNext: () => void;
}) {
  return (
    <>
      {state.page.data?.nextCursor ? <Button onClick={onNext}>Next invoices</Button> : null}
      {hasPrevious ? (
        <Button variant="secondary" onClick={onFirst}>
          First invoices
        </Button>
      ) : null}
    </>
  );
}
function SelectedInvoice({ state, onClose }: { state: State; onClose: () => void }) {
  if (!state.visibleId) return null;
  if (state.detail.isPending || state.detail.isFetching)
    return <p role="status">Loading invoice balance…</p>;
  return state.detail.data ? <InvoiceBalance value={state.detail.data} onClose={onClose} /> : null;
}
function InvoiceReferences({ state, onSelect }: { state: State; onSelect: (id: string) => void }) {
  if (!state.page.data?.data.length) return <p>No invoices are available for this Stay.</p>;
  return (
    <ul className="space-y-2">
      {state.page.data.data.map((row) => (
        <li key={row.invoiceId}>
          <p>
            {row.invoiceNumber} · Due {row.dueDate} ·{' '}
            {row.documentState === 'issued' ? 'Issued document' : 'Voided document'}
          </p>
          <Button variant="secondary" onClick={() => onSelect(row.invoiceId)}>
            View invoice {row.invoiceNumber}
          </Button>
        </li>
      ))}
    </ul>
  );
}
function amount(value: number) {
  return formatExactMoney(moneyFromJson(value));
}
const labels: Record<ResidentInvoiceBalance['state'], string> = {
  issued: 'Issued',
  partially_paid: 'Partially paid',
  paid: 'Paid',
  overdue: 'Overdue',
  no_charge: 'No charge',
  voided: 'Voided',
};
const lineLabels: Record<NonNullable<ResidentInvoiceBalance['lineItems']>[number]['kind'], string> =
  {
    rent: 'Rent',
    transport: 'Transport',
    mess: 'Mess',
    utilities: 'Utilities',
    admission: 'Admission fee',
    custom: 'Other charge',
    late_fee: 'Late fee',
  };
// CHG-061 / CHG-055: one total payable = open bill balance + security still due (unless a
// security proof already waits for review). Exact paisa integers only.
export function totalPayable(value: ResidentInvoiceBalance) {
  const security = (value.securityPendingPaisa ?? 0) > 0 ? 0 : (value.securityDuePaisa ?? 0);
  return value.outstandingPaisa + security;
}
export function InvoiceBalance({
  value,
  onClose,
}: {
  value: ResidentInvoiceBalance;
  onClose: () => void;
}) {
  return (
    <section aria-label="Current invoice balance" className="space-y-1">
      <h5 className="font-semibold">{value.invoiceNumber}</h5>
      <p>Financial status: {labels[value.state]}</p>
      <p>
        Due: {value.dueDate} · Agreed grace: {value.graceDays} days
      </p>
      {/* CHG-061: rent, transport and other charges are separate lines on one bill. */}
      {value.lineItems?.length ? (
        <ul aria-label="Invoice charges">
          {value.lineItems.map((line, index) => (
            <li key={index}>
              {lineLabels[line.kind]}: {amount(line.amountPaisa)}
            </li>
          ))}
        </ul>
      ) : null}
      <p>Original total: {amount(value.totalPaisa)}</p>
      <p>Debit adjustments: {amount(value.debitAdjustmentsPaisa)}</p>
      <p>Credit adjustments: {amount(value.creditAdjustmentsPaisa)}</p>
      <p>Receipt-backed allocations: {amount(value.allocatedPaisa)}</p>
      <p>Outstanding: {amount(value.outstandingPaisa)}</p>
      {/* Security is a refundable liability, shown apart from rent. Security already proved and
          waiting for review is not asked for again. */}
      {(value.securityDuePaisa ?? 0) > 0 ? (
        <p>Security deposit due: {amount(value.securityDuePaisa ?? 0)}</p>
      ) : null}
      {(value.securityPendingPaisa ?? 0) > 0 ? (
        <p>Security proof awaiting hostel review: {amount(value.securityPendingPaisa ?? 0)}</p>
      ) : null}
      <p className="font-semibold">Total payable: {amount(totalPayable(value))}</p>
      <p>Payment proofs alone do not mark an invoice paid.</p>
      <Button variant="ghost" onClick={onClose}>
        Close invoice balance
      </Button>
    </section>
  );
}
