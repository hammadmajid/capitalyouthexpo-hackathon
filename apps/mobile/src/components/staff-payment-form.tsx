import { useState } from 'react';
import { Text, View } from 'react-native';
import { billingFormPaisa, billingFormRupees, marketplacePrice } from '@hsm/api-client';
import { DISPLAY_TIME_ZONE, formatDate, type RecordExternalPaymentInput } from '@hsm/contracts';
import { Skeleton } from './loading/skeleton';
import { safeMessage } from '../lib/messages';
import { Button, Copy } from './ui';
import { PaymentBills } from './payment-bills';
import { PaymentFormFields } from './payment-form-fields';
import { StaffPaymentReview } from './staff-payment-review';
import { StaffPaymentProof, type StaffPaymentProofState } from './staff-payment-proof';
import {
  paymentCommand,
  paymentProblems,
  type PaymentEntry,
  type PaymentPlan,
} from './payment-plan';
import { useOpenBills } from './use-open-bills';
function todayKarachi() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: DISPLAY_TIME_ZONE }).format(new Date());
}
type Props = {
  actorId: string;
  branchId: string;
  stayId: string;
  invoiceId?: string;
  residentLabel: string;
  // A failed save, shown where the recorder is looking (next to the button).
  saveError?: string | undefined;
  onRecord: (command: RecordExternalPaymentInput) => void;
};
type Review = { command: RecordExternalPaymentInput; plan: PaymentPlan; labels: string[] };
// PAY-008 / FIN-001: pick the bills, enter what was received; the app splits it oldest
// bill first, shows the remaining balance and blocks excess.
export function StaffPaymentForm(props: Props) {
  const open = useOpenBills(props.actorId, props.branchId, props.stayId, props.invoiceId);
  const [entry, setEntry] = useState<PaymentEntry>({
    amount: '',
    deposit: '',
    method: '',
    paidOn: todayKarachi(),
    // A ready-made note; staff may change it, and an emptied note saves the same text.
    note: 'Payment recorded',
    transactionReference: '',
  });
  const [securityTyped, setSecurityTyped] = useState(false);
  const [typed, setTyped] = useState(false),
    [left, setLeft] = useState<string[]>([]),
    [showProblems, setShowProblems] = useState(false),
    [review, setReview] = useState<Review>();
  const [proof, setProof] = useState<StaffPaymentProofState>({
    attached: false,
    busy: false,
    fileId: undefined,
  });
  if (open.loading) return <Skeleton kind="list" label="Loading unpaid bills" />;
  if (open.error)
    return (
      <View className="gap-2">
        <Copy alert>{safeMessage(open.error)}</Copy>
      </View>
    );
  const chosen = open.bills.filter((bill) => !left.includes(bill.invoiceId));
  const owed = chosen.reduce((sum, bill) => sum + BigInt(bill.outstandingPaisa), 0n);
  // Until the recorder types an amount, it follows the total of the chosen bills.
  const securityDue = props.invoiceId || open.securityPendingPaisa > 0 ? 0 : open.securityDuePaisa;
  const deposit = securityTyped
    ? entry.deposit
    : securityDue > 0
      ? billingFormRupees(securityDue)
      : '';
  let depositAmount = 0;
  try {
    depositAmount = deposit ? billingFormPaisa(deposit) : 0;
  } catch {
    /* The field validation below explains invalid input. */
  }
  const current = {
    ...entry,
    deposit,
    amount: typed
      ? entry.amount
      : owed + BigInt(depositAmount) > 0n
        ? billingFormRupees(Number(owed + BigInt(depositAmount)))
        : '',
  };
  const proofPending = proof.busy || (proof.attached && !proof.fileId);
  const problems = paymentProblems(current, proofPending);
  const built = paymentCommand(current, chosen, proof.attached ? proof.fileId : undefined);
  if (built && built.plan.advancePaisa > 0)
    problems.push('Amount exceeds the selected bills and security deposit total');
  if (
    props.invoiceId &&
    built &&
    (built.command.depositPaisa ||
      built.command.advanceCreditPaisa ||
      !built.command.allocations.length)
  )
    problems.push('Enter a payment up to the unpaid Transport amount');
  if (review)
    return (
      <StaffPaymentReview
        residentLabel={props.residentLabel}
        {...review}
        saveError={props.saveError}
        onEdit={() => setReview(undefined)}
        onRecord={() => props.onRecord(review.command)}
      />
    );
  return (
    <View accessibilityLabel="External payment draft" className="gap-4">
      <Text className="font-heading text-body text-heading">Pay towards</Text>
      <PaymentBills
        bills={open.bills}
        chosen={chosen.map((bill) => bill.invoiceId)}
        onToggle={(id) =>
          setLeft((now) => (now.includes(id) ? now.filter((row) => row !== id) : [...now, id]))
        }
      />
      <Copy>Security deposit: {marketplacePrice(depositAmount)}</Copy>
      <PaymentFormFields
        value={current}
        hideDeposit={Boolean(props.invoiceId) || open.securityPendingPaisa > 0}
        onChange={(patch) => {
          if (patch.amount !== undefined) setTyped(true);
          if (patch.deposit !== undefined) setSecurityTyped(true);
          setEntry((now) => ({ ...now, ...patch }));
        }}
      />
      <StaffPaymentProof actorId={props.actorId} value={proof} onChange={setProof} />
      {built ? <PlanLine plan={built.plan} /> : null}
      {showProblems && problems.length ? (
        <View accessibilityRole="alert" className="gap-1">
          {problems.map((problem) => (
            <Copy key={problem} alert>
              • {problem}
            </Copy>
          ))}
        </View>
      ) : null}
      <Button
        label="Review payment"
        onPress={() => {
          setShowProblems(true);
          if (problems.length || !built) return;
          const due = new Map(chosen.map((bill) => [bill.invoiceId, bill.dueDate]));
          setReview({
            ...built,
            labels: built.plan.allocations.map(
              (row) =>
                (chosen.find((bill) => bill.invoiceId === row.invoiceId)?.label || 'Bill') +
                ' due ' +
                formatDate((due.get(row.invoiceId) ?? '') + 'T00:00:00.000Z'),
            ),
          });
        }}
      />
    </View>
  );
}
// Explain partial payment and refuse excess totals.
function PlanLine({ plan }: { plan: PaymentPlan }) {
  if (plan.allocations.length && plan.remainingPaisa > 0)
    return <Copy alert>Partial payment · {marketplacePrice(plan.remainingPaisa)} still due</Copy>;
  if (plan.advancePaisa > 0)
    return <Copy alert>Amount exceeds the selected bills and security deposit total</Copy>;
  if (plan.allocations.length) return <Copy>Pays in full</Copy>;
  return null;
}
