'use client';
import { useState } from 'react';
import type { RecordExternalPaymentInput } from '@hsm/contracts';
import { formatExactMoney, moneyFromJson } from '@hsm/contracts';
import { Button } from './ui/button';
export function StaffPaymentReview({
  residentLabel,
  command,
  labels,
  onEdit,
  onRecord,
}: {
  residentLabel: string;
  command: RecordExternalPaymentInput;
  labels: string[];
  onEdit: () => void;
  onRecord: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false),
    amount = (paisa: number) => formatExactMoney(moneyFromJson(paisa));
  return (
    <section aria-label="Review external payment" className="space-y-3">
      <h4 className="font-semibold">Confirm payment for {residentLabel}</h4>
      <p>
        Received: {amount(command.amountPaisa)} · {command.method.replaceAll('_', ' ')} ·{' '}
        {command.paidOn}
      </p>
      <p>Recording note: {command.note}</p>
      {command.transactionReference ? (
        <p>External reference: {command.transactionReference}</p>
      ) : null}
      {command.proofFileId ? <p>Private checked proof attached.</p> : null}
      <ul>
        {command.allocations.map((row, index) => (
          <li key={row.invoiceId}>
            {labels.at(index)}: {amount(row.amountPaisa)}
          </li>
        ))}
      </ul>
      <p>Deposit received: {amount(command.depositPaisa)}</p>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        I confirm this money was received directly by the hostel and the allocation is correct.
      </label>
      <Button disabled={!confirmed} onClick={onRecord}>
        Confirm recorded payment
      </Button>
      <Button variant="ghost" onClick={onEdit}>
        Edit payment
      </Button>
    </section>
  );
}
