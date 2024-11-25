'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  billingFormPaisa,
  marketplacePrice,
  readFinalStatement,
  recordStayFundMovement,
} from '@hsm/api-client';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
import { GroupedNumberInput } from './ui/grouped-number-input';
import { useCommand } from './services/use-command';
import { CommandRecovery } from './services/command-recovery';
// P9-FIX-04 / OUT-004: after checkout staff may still record a refund the hostel paid; it is
// listed beside the unchanged final statement. HSM never moves the money.
export function PostCheckoutRefund({
  actorId,
  branchId,
  stayId,
}: {
  actorId: string;
  branchId: string;
  stayId: string;
}) {
  const key = ['final-statement', actorId, branchId, stayId];
  const statement = useQuery({
    queryKey: key,
    gcTime: 0,
    retry: false,
    queryFn: () => readFinalStatement(browserClient(), stayId, branchId),
  });
  const [form, setForm] = useState({
    source: '',
    kind: 'deposit_refund',
    amount: '',
    reference: '',
    reason: '',
  });
  const record = useCommand(
    'PostCheckoutRefund:record',
    (body: Record<string, unknown>, idempotency) =>
      recordStayFundMovement(browserClient(), branchId, stayId, body, idempotency),
    [key],
  );
  let paisa: number | undefined;
  try {
    paisa = form.amount ? billingFormPaisa(form.amount) : undefined;
  } catch {
    paisa = undefined;
  }
  const sources = statement.data?.afterCheckout.current.fundSources ?? [];
  if (!sources.length && !record.unresolved) return null;
  return (
    <section aria-label="Record refund" className="space-y-2">
      <h5 className="font-semibold">Record a refund paid after checkout</h5>
      <CommandRecovery command={record} />
      {record.isError ? <p role="alert">{errorMessage(record.error)}</p> : null}
      {record.isSuccess ? <p role="status">Refund recorded.</p> : null}
      <select
        aria-label="Refund source payment"
        className="field-input"
        value={form.source}
        onChange={(event) => setForm({ ...form, source: event.target.value })}
      >
        <option value="">Choose a receipt</option>
        {sources.map((row) => (
          <option key={row.paymentId} value={row.paymentId}>
            {row.receiptNumber} · deposit {marketplacePrice(row.depositPaisa)} · advance{' '}
            {marketplacePrice(row.advanceCreditPaisa)}
          </option>
        ))}
      </select>
      <select
        aria-label="Refund kind"
        className="field-input"
        value={form.kind}
        onChange={(event) => setForm({ ...form, kind: event.target.value })}
      >
        <option value="deposit_refund">Deposit refund</option>
        <option value="advance_refund">Advance refund</option>
      </select>
      <GroupedNumberInput
        aria-label="Refund amount (PKR)"
        className="field-input"
        value={form.amount}
        onValueChange={(value) => setForm({ ...form, amount: value })}
      />
      <input
        aria-label="Refund reference (optional)"
        className="field-input"
        maxLength={160}
        value={form.reference}
        onChange={(event) => setForm({ ...form, reference: event.target.value })}
      />
      <input
        aria-label="Refund reason"
        className="field-input"
        maxLength={500}
        value={form.reason}
        onChange={(event) => setForm({ ...form, reason: event.target.value })}
      />
      <Button
        disabled={!form.source || !paisa || !form.reason.trim() || record.isPending}
        onClick={() =>
          record.mutate(
            {
              paymentId: form.source,
              movement: {
                kind: form.kind,
                amountPaisa: paisa,
                reason: form.reason.trim(),
                ...(form.reference.trim() ? { externalReference: form.reference.trim() } : {}),
              },
            },
            {
              onSuccess: () =>
                setForm({
                  source: '',
                  kind: 'deposit_refund',
                  amount: '',
                  reference: '',
                  reason: '',
                }),
            },
          )
        }
      >
        Record refund
      </Button>
    </section>
  );
}
