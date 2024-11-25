'use client';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ResidentProof } from '@hsm/contracts';
import {
  marketplacePrice,
  ownStayPaymentProofs,
  stayPaymentInstructions,
  submitStayPaymentProof,
  billingFormPaisa,
} from '@hsm/api-client';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { PrivateFileInput } from './private-file-input';
import { Button } from './ui/button';
import { OwnReceipt } from './customer/own-receipt';
import { GroupedNumberInput } from './ui/grouped-number-input';
import { usePaymentObligations } from './payment-obligations';
const methods = ['bank_transfer', 'jazzcash', 'easypaisa', 'other'] as const;
export const proofLabels: Record<ResidentProof['state'], string> = {
  submitted: 'Pending verification by the hostel',
  approved: 'Verified: payment recorded',
  rejected: 'Not accepted',
};
function ProofHistory({ actorId, stayId }: { actorId: string; stayId: string }) {
  const proofs = useQuery({
    queryKey: ['own-payment-proofs', actorId, stayId],
    gcTime: 0,
    queryFn: () => ownStayPaymentProofs(browserClient(), stayId),
  });
  if (proofs.isPending) return <p role="status">Loading payment history…</p>;
  if (proofs.isError) return <p role="alert">{errorMessage(proofs.error)}</p>;
  if (proofs.data.data.length === 0) return <p>No payment proofs submitted yet.</p>;
  return (
    <ul className="space-y-2" aria-label="Payment proof history">
      {proofs.data.data.map((proof) => (
        <li key={proof.id}>
          {proof.invoiceNumber ?? 'Security deposit'}
          {(proof.depositPaisa ?? 0) > 0 && proof.invoiceNumber ? ' + security deposit' : ''}:{' '}
          {marketplacePrice(proof.amountPaisa)} on {proof.paidOn} · {proofLabels[proof.state]}
          {proof.state === 'rejected' ? ' — ' + (proof.reviewReason ?? '') : ''}
          {proof.receiptId ? (
            <OwnReceipt actorId={actorId} stayId={stayId} receiptId={proof.receiptId} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
// PAY-001..003: the resident pays the hostel directly, then submits evidence. Submitting
// never marks an invoice paid; the hostel verifies it first.
export function PayRent({ actorId, stayId }: { actorId: string; stayId: string }) {
  const cache = useQueryClient(),
    keys = useRef(new Map<string, string>());
  const [open, setOpen] = useState(false),
    [chosen, setChosen] = useState<string[]>(),
    [includeSecurity, setIncludeSecurity] = useState(true),
    [securityAmount, setSecurityAmount] = useState<string>(),
    [amount, setAmount] = useState<string>(),
    [fileId, setFileId] = useState<string>(),
    [method, setMethod] = useState<(typeof methods)[number]>('bank_transfer'),
    [paidOn, setPaidOn] = useState(''),
    [reference, setReference] = useState(''),
    [busy, setBusy] = useState(false);
  const instructions = useQuery({
    queryKey: ['stay-payment-instructions', actorId, stayId],
    enabled: open,
    gcTime: 0,
    queryFn: () => stayPaymentInstructions(browserClient(), stayId),
  });
  const obligations = usePaymentObligations(actorId, stayId, open);
  const submit = useMutation({
    gcTime: 0,
    mutationFn: (input: Record<string, unknown>) => {
      const command = JSON.stringify(input),
        key = keys.current.get(command) ?? crypto.randomUUID();
      keys.current.set(command, key);
      return submitStayPaymentProof(browserClient(), stayId, input, key);
    },
    onSuccess: async () => {
      keys.current.clear();
      setFileId(undefined);
      setChosen(undefined);
      setAmount(undefined);
      setSecurityAmount(undefined);
      await Promise.all(
        ['own-payment-proofs', 'own-payment-summary', 'own-invoice-balance'].map((key) =>
          cache.invalidateQueries({ queryKey: [key, actorId, stayId] }),
        ),
      );
    },
  });
  if (!open)
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Pay rent
      </Button>
    );
  const summary = obligations.security.data;
  const securityDue = summary?.pendingDepositPaisa ? 0 : (summary?.outstandingDepositPaisa ?? 0);
  const securityTyped = securityAmount ?? (securityDue ? String(securityDue / 100) : '');
  let deposit = 0;
  try {
    deposit = includeSecurity && securityDue ? billingFormPaisa(securityTyped) : 0;
  } catch {
    deposit = -1;
  }
  const selected = chosen ?? obligations.bills.slice(0, 12).map((row) => row.invoiceId);
  const bills = obligations.bills.filter((row) => selected.includes(row.invoiceId));
  const total = bills.reduce((sum, row) => sum + row.outstandingPaisa, 0) + Math.max(0, deposit);
  const typed = amount ?? (total ? String(total / 100) : '');
  let amountPaisa: number | undefined;
  try {
    amountPaisa = typed ? billingFormPaisa(typed) : undefined;
  } catch {
    amountPaisa = undefined;
  }
  const ready = Boolean(
    fileId &&
    paidOn &&
    amountPaisa &&
    amountPaisa <= total &&
    amountPaisa >= deposit &&
    deposit >= 0 &&
    deposit <= securityDue &&
    (bills.length || deposit > 0) &&
    !busy &&
    !submit.isPending &&
    !obligations.loading &&
    !obligations.error,
  );
  return (
    <section aria-label="Pay rent" className="space-y-3">
      <h4 className="font-semibold">Pay rent</h4>
      <p>Pay the hostel directly using one of these accounts. HSM does not receive money.</p>
      {obligations.error ? <p role="alert">{errorMessage(obligations.error)}</p> : null}
      {obligations.loading ? <p role="status">Loading payment balances…</p> : null}
      {instructions.isError ? <p role="alert">{errorMessage(instructions.error)}</p> : null}
      {instructions.data && instructions.data.data.length === 0 ? (
        <p>The hostel has not published payment accounts yet.</p>
      ) : null}
      <ul aria-label="Hostel payment accounts">
        {instructions.data?.data.map((row) => (
          <li key={row.id}>
            {row.method.replaceAll('_', ' ')}: {row.accountTitle} · {row.accountIdentifier}
            {row.instructions ? ' · ' + row.instructions : ''}
          </li>
        ))}
      </ul>
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!ready) return;
          const [first, ...others] = bills;
          submit.mutate({
            ...(first ? { invoiceId: first.invoiceId } : {}),
            ...(others.length ? { alsoInvoiceIds: others.map((row) => row.invoiceId) } : {}),
            ...(deposit > 0 ? { depositPaisa: deposit } : {}),
            fileId,
            amountPaisa,
            method,
            paidOn,
            ...(reference.trim() ? { reference: reference.trim() } : {}),
          });
        }}
      >
        {summary?.pendingDepositPaisa ? (
          <p>Security proof is already awaiting hostel verification.</p>
        ) : null}
        {securityDue > 0 ? (
          <>
            <label>
              <input
                type="checkbox"
                checked={includeSecurity}
                onChange={(e) => {
                  setIncludeSecurity(e.target.checked);
                  setAmount(undefined);
                }}
              />{' '}
              Include security deposit · {marketplacePrice(securityDue)}
            </label>
            {includeSecurity ? (
              <label className="field-label">
                Security deposit paid (PKR)
                <GroupedNumberInput
                  aria-label="Security deposit paid (PKR)"
                  className="field-input"
                  value={securityTyped}
                  onValueChange={(value) => {
                    setSecurityAmount(value);
                    setAmount(undefined);
                  }}
                />
              </label>
            ) : null}
          </>
        ) : null}
        {obligations.bills.map((row) => (
          <label key={row.invoiceId} className="flex gap-2">
            <input
              type="checkbox"
              aria-label={'Pay ' + row.invoiceNumber}
              checked={selected.includes(row.invoiceId)}
              onChange={() => {
                const next = selected.includes(row.invoiceId)
                  ? selected.filter((id) => id !== row.invoiceId)
                  : [...selected, row.invoiceId];
                if (next.length <= 12) {
                  setChosen(next);
                  setAmount(undefined);
                }
              }}
            />
            {row.kind ?? 'Bill'} · {row.invoiceNumber} · {marketplacePrice(row.outstandingPaisa)}
          </label>
        ))}
        <p>Total {marketplacePrice(total)} · one payment</p>
        {amountPaisa !== undefined && amountPaisa > total ? (
          <p role="alert">Amount exceeds the selected bills and security total.</p>
        ) : null}
        <label className="field-label">
          Amount paid (PKR)
          <GroupedNumberInput
            aria-label="Amount paid (PKR)"
            className="field-input"
            value={typed}
            onValueChange={(value) => setAmount(value)}
          />
        </label>
        <PrivateFileInput
          id={'rent-proof-' + stayId}
          label="Payment proof (screenshot or receipt)"
          purpose="payment_proof"
          disabled={submit.isPending}
          onReady={setFileId}
          onBusy={setBusy}
        />
        <label className="field-label">
          Payment method
          <select
            aria-label="Payment method"
            className="field-input"
            value={method}
            onChange={(event) =>
              setMethod(methods.find((value) => value === event.target.value) ?? 'other')
            }
          >
            {methods.map((value) => (
              <option key={value} value={value}>
                {value.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Payment date
          <input
            aria-label="Payment date"
            className="field-input"
            type="date"
            value={paidOn}
            onChange={(event) => setPaidOn(event.target.value)}
          />
        </label>
        <label className="field-label">
          Transaction reference (optional)
          <input
            aria-label="Transaction reference (optional)"
            className="field-input"
            maxLength={120}
            value={reference}
            onChange={(event) => setReference(event.target.value)}
          />
        </label>
        {submit.isError ? <p role="alert">{errorMessage(submit.error)}</p> : null}
        {submit.isSuccess ? <p role="status">Proof submitted: pending verification.</p> : null}
        <Button type="submit" disabled={!ready}>
          {submit.isPending ? 'Submitting proof…' : 'Submit payment proof'}
        </Button>
        <p>A proof is not a payment confirmation. The hostel verifies it before it counts.</p>
      </form>
      <ProofHistory actorId={actorId} stayId={stayId} />
      <Button variant="ghost" onClick={() => setOpen(false)}>
        Close pay rent
      </Button>
    </section>
  );
}
