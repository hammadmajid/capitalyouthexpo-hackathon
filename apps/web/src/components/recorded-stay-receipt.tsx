'use client';
import type { useStaffStayPayment } from '../lib/use-staff-stay-payment';
import { formatExactMoney, moneyFromJson } from '@hsm/contracts';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
export function RecordedStayReceipt({
  query,
}: {
  query: ReturnType<typeof useStaffStayPayment>['receipt'];
}) {
  if (query.error)
    return (
      <>
        <p role="alert">{errorMessage(query.error)}</p>
        <Button disabled={query.isFetching} onClick={() => void query.refetch()}>
          Retry receipt
        </Button>
      </>
    );
  if (query.isPending || query.isFetching)
    return <p role="status">Loading authoritative receipt…</p>;
  const value = query.data;
  if (!value) return null;
  const receipt = value.snapshot,
    amount = (paisa: number) => formatExactMoney(moneyFromJson(paisa));
  return (
    <section aria-label="Recorded payment receipt" className="space-y-1">
      <h4 className="font-semibold">Receipt {value.receiptNumber}</h4>
      <p>
        {value.reversed
          ? 'Original payment reversed; receipt retained.'
          : 'Approved external payment receipt'}
      </p>
      <p>Resident: {receipt.residentName}</p>
      <p>
        Hostel: {receipt.hostelName} · {receipt.branchName}
      </p>
      <p>
        Received: {amount(receipt.amountPaisa)} · {receipt.method.replaceAll('_', ' ')} ·{' '}
        {receipt.paidOn}
      </p>
      {receipt.transactionReference ? (
        <p>External reference: {receipt.transactionReference}</p>
      ) : null}
      <ul>
        {receipt.allocations.map((row) => (
          <li key={row.invoiceId}>
            {row.invoiceNumber}: {amount(row.amountPaisa)}
          </li>
        ))}
      </ul>
      <p>Invoice allocations: {amount(receipt.distribution.allocatedPaisa)}</p>
      <p>Deposit received: {amount(receipt.distribution.depositPaisa)}</p>
      <p>Advance credit: {amount(receipt.distribution.advanceCreditPaisa)}</p>
      <p>This receipt does not transfer money or by itself settle every invoice.</p>
    </section>
  );
}
