import { NumericTextInput as TextInput } from './grouped-number-input';
import { Skeleton } from './loading/skeleton';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import type { ResidentProof } from '@hsm/contracts';
import {
  billingFormPaisa,
  marketplacePrice,
  ownStayPaymentProofs,
  readCustomerStayReceipt,
  stayPaymentInstructions,
  submitStayPaymentProof,
} from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { proofBills } from '../lib/proof-bills';
import { Copy } from './ui';
import { MarketplaceAction as Button } from './marketplace/action';
import { DateField } from './date-field';
import { PrivateFilePicker } from './private-file-picker';
import { FilterChip } from './inventory-tools';
import { PayBills, useOpenBills } from './pay-bills';
import { PaySecurity, usePaySecurity } from './pay-security';
import { FinancialDocument } from './financial-document';
import { receiptDocument } from '../lib/financial-document';
const methods = ['bank_transfer', 'jazzcash', 'easypaisa', 'other'] as const;
const methodText = {
  bank_transfer: 'Bank',
  jazzcash: 'JazzCash',
  easypaisa: 'Easypaisa',
  other: 'Other',
} as const;
const field =
  'min-h-12 rounded-input border border-border bg-inputSurface px-4 py-3 font-body text-body text-text';
const labels: Record<ResidentProof['state'], string> = {
  submitted: 'Pending verification by the hostel',
  approved: 'Verified: payment recorded',
  rejected: 'Not accepted',
};
function Receipt(props: { actorId: string; stayId: string; receiptId: string }) {
  const receipt = useQuery({
    queryKey: ['own-receipt', props.actorId, props.stayId, props.receiptId],
    gcTime: 0,
    retry: false,
    queryFn: async () =>
      readCustomerStayReceipt(await actorClient(props.actorId), props.stayId, props.receiptId),
  });
  if (receipt.isPending) return <Skeleton kind="list" label="Loading receipt…" />;
  if (receipt.isError) return <Copy alert>{safeMessage(receipt.error)}</Copy>;
  const value = receipt.data;
  return (
    <View className="gap-1" accessibilityLabel="Payment receipt">
      <Copy>Receipt {value.receiptNumber}</Copy>
      <Copy>
        {marketplacePrice(value.snapshot.amountPaisa)} received by {value.snapshot.hostelName} on{' '}
        {value.snapshot.paidOn}
      </Copy>
      {value.reversed ? <Copy alert>This payment was reversed by the hostel.</Copy> : null}
      {value.snapshot.distribution.depositPaisa > 0 ? (
        <Copy>Security deposit: {marketplacePrice(value.snapshot.distribution.depositPaisa)}</Copy>
      ) : null}
      <Copy>Bills: {marketplacePrice(value.snapshot.distribution.allocatedPaisa)}</Copy>
      <FinancialDocument document={receiptDocument(value)} />
    </View>
  );
}
// PAY-001..003: pay the hostel directly, then submit evidence for verification.
// CHG-050: every open bill (rent and transport) is ticked by default and paid with one
// transfer, one screenshot and one proof; the hostel approves it once.
export function NativePayRent({ actorId, stayId }: { actorId: string; stayId: string }) {
  const cache = useQueryClient(),
    keys = useRef(new Map<string, string>());
  const [open, setOpen] = useState(false),
    [chosen, setChosen] = useState<string[]>(),
    [amount, setAmount] = useState<string>(),
    [fileId, setFileId] = useState<string>(),
    [method, setMethod] = useState<(typeof methods)[number]>('bank_transfer'),
    [paidOn, setPaidOn] = useState(''),
    [reference, setReference] = useState(''),
    [busy, setBusy] = useState(false),
    [receipt, setReceipt] = useState<string>();
  const instructions = useQuery({
    queryKey: ['stay-payment-instructions', actorId, stayId],
    enabled: open,
    gcTime: 0,
    queryFn: async () => stayPaymentInstructions(await actorClient(actorId), stayId),
  });
  const open_ = useOpenBills(actorId, stayId, open);
  const security = usePaySecurity(actorId, stayId, open);
  const proofs = useQuery({
    queryKey: ['own-payment-proofs', actorId, stayId],
    enabled: open,
    gcTime: 0,
    queryFn: async () => ownStayPaymentProofs(await actorClient(actorId), stayId),
  });
  const submit = useMutation({
    gcTime: 0,
    mutationFn: async (input: Record<string, unknown>) => {
      const command = JSON.stringify(input),
        key = keys.current.get(command) ?? randomUUID();
      keys.current.set(command, key);
      return submitStayPaymentProof(await actorClient(actorId), stayId, input, key);
    },
    onSuccess: async () => {
      keys.current.clear();
      setFileId(undefined);
      setChosen(undefined);
      setAmount(undefined);
      security.reset();
      await Promise.all(
        [
          ['own-payment-proofs', actorId, stayId],
          ['own-invoice-balance', actorId, stayId],
          ['own-payment-summary', actorId, stayId],
        ].map((queryKey) => cache.invalidateQueries({ queryKey })),
      );
    },
  });
  // Bills not yet chosen by hand: all of them. The amount follows the chosen bills' total
  // until the resident types their own.
  const pendingBills = new Set(
    (proofs.data?.data ?? [])
      .filter((proof) => proof.state === 'submitted')
      .flatMap(
        (proof) =>
          proof.invoices?.map((bill) => bill.invoiceId) ??
          (proof.invoiceId ? [proof.invoiceId] : []),
      ),
  );
  const available = open_.bills.filter((bill) => !pendingBills.has(bill.invoiceId));
  const selected = chosen ?? available.slice(0, 12).map((bill) => bill.invoiceId);
  const picked = available.filter((bill) => selected.includes(bill.invoiceId));
  const total =
    picked.reduce((sum, bill) => sum + bill.outstandingPaisa, 0) + Math.max(0, security.deposit);
  useEffect(() => {
    if (!submit.isSuccess) return;
    setReference('');
  }, [submit.isSuccess]);
  if (!open) return <Button secondary label="Pay rent" onPress={() => setOpen(true)} />;
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
    (picked.length || security.deposit > 0) &&
    amountPaisa &&
    amountPaisa >= security.deposit &&
    amountPaisa <= total &&
    security.valid &&
    !open_.loading &&
    !open_.error &&
    !proofs.isPending &&
    !proofs.error &&
    !busy &&
    !submit.isPending,
  );
  return (
    <View className="gap-2" accessibilityLabel="Pay rent">
      <Copy>Pay the hostel directly using one of these accounts. HSM does not receive money.</Copy>
      {instructions.isError ? <Copy alert>{safeMessage(instructions.error)}</Copy> : null}
      {/* PAY-001: a failed invoice or proof read must say so, never leave Submit dead. */}
      {open_.error ? <Copy alert>{safeMessage(open_.error)}</Copy> : null}
      {proofs.isError ? <Copy alert>{safeMessage(proofs.error)}</Copy> : null}
      {!open_.loading &&
      !open_.error &&
      !security.query.isPending &&
      !security.due &&
      available.length === 0 ? (
        <Copy>Nothing to pay</Copy>
      ) : null}
      {instructions.data?.data.length === 0 ? (
        <Copy>The hostel has not published payment accounts yet.</Copy>
      ) : null}
      {instructions.data?.data.map((row) => (
        <Copy key={row.id}>
          {row.method.replaceAll('_', ' ')}: {row.accountTitle} · {row.accountIdentifier}
        </Copy>
      ))}
      {open_.loading ? <Skeleton kind="list" label="Loading bills…" /> : null}
      <PaySecurity value={security} onChange={() => setAmount(undefined)} />
      <PayBills
        bills={available}
        chosen={selected}
        onChange={(next) => {
          if (next.length > 12) return;
          setChosen(next);
          setAmount(undefined);
        }}
        disabled={submit.isPending}
      />
      <Copy>Total {marketplacePrice(total)} · one payment</Copy>
      {amountPaisa !== undefined && amountPaisa > total ? (
        <Copy alert>Amount exceeds the selected bills and security total.</Copy>
      ) : null}
      <TextInput
        accessibilityLabel="Amount paid (PKR)"
        placeholder="Amount paid (PKR)"
        value={typed}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        className={field}
      />
      <View className="flex-row flex-wrap gap-2">
        {methods.map((value) => (
          <FilterChip
            key={value}
            text={methodText[value]}
            label={'Paid by ' + value.replaceAll('_', ' ')}
            selected={method === value}
            onPress={() => setMethod(value)}
          />
        ))}
      </View>
      <DateField label="Payment date" value={paidOn} onChange={setPaidOn} />
      <TextInput
        accessibilityLabel="Transaction reference (optional)"
        placeholder="Transaction reference (optional)"
        value={reference}
        onChangeText={setReference}
        maxLength={120}
        className={field}
      />
      <PrivateFilePicker
        actorId={actorId}
        label="Attach payment proof"
        purpose="payment_proof"
        onReady={setFileId}
        onBusy={setBusy}
        disabled={submit.isPending}
      />
      {submit.isError ? <Copy alert>{safeMessage(submit.error)}</Copy> : null}
      {submit.isSuccess ? <Copy>Proof submitted: pending verification.</Copy> : null}
      <Button
        label={submit.isPending ? 'Submitting proof…' : 'Submit payment proof'}
        disabled={!ready}
        onPress={() => {
          if (!ready) return;
          const [main, ...others] = picked;
          submit.mutate({
            ...(main ? { invoiceId: main.invoiceId } : {}),
            ...(security.deposit > 0 ? { depositPaisa: security.deposit } : {}),
            ...(others.length ? { alsoInvoiceIds: others.map((bill) => bill.invoiceId) } : {}),
            fileId,
            amountPaisa,
            method,
            paidOn,
            ...(reference.trim() ? { reference: reference.trim() } : {}),
          });
        }}
      />
      <Copy>A proof is not a payment confirmation. The hostel verifies it before it counts.</Copy>
      {proofs.data?.data.map((proof) => (
        <View key={proof.id} className="gap-1">
          <Copy>
            {proofBills(proof)}: {marketplacePrice(proof.amountPaisa)} · {labels[proof.state]}
            {proof.state === 'rejected' ? ' — ' + (proof.reviewReason ?? '') : ''}
          </Copy>
          {proof.receiptId ? (
            <Button
              secondary
              label={'View receipt for ' + (proof.invoiceNumber ?? 'security deposit')}
              onPress={() => setReceipt(proof.receiptId ?? undefined)}
            />
          ) : null}
        </View>
      ))}
      {receipt ? <Receipt actorId={actorId} stayId={stayId} receiptId={receipt} /> : null}
      <Button secondary label="Close pay rent" onPress={() => setOpen(false)} />
    </View>
  );
}
