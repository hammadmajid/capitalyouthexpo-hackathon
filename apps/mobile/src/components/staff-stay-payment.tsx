import { AppHeader } from './navigation/header';
import { useOwnerScreenBack } from './owner-screen-back';
import { View } from 'react-native';
import { Button, Copy } from './ui';
import { useStaffStayPayment } from './use-staff-stay-payment';
import { safeMessage } from '../lib/messages';
import { StaffPaymentForm } from './staff-payment-form';
import { paymentErrorMessage } from './payment-error';
import { RecordedStayReceipt } from './recorded-stay-receipt';
type Props = {
  actorId: string;
  branchId: string;
  stayId: string;
  invoiceId?: string;
  unavailable: boolean;
  onClose: () => void;
};
type State = ReturnType<typeof useStaffStayPayment>;
export function StaffStayPayment(props: Props) {
  return (
    <Payment
      key={[props.actorId, props.branchId, props.stayId, props.invoiceId].join(':')}
      {...props}
    />
  );
}
function Payment(props: Props) {
  const state = useStaffStayPayment(props.actorId, props.branchId, props.stayId, props.unavailable);
  const backDisabled = state.mutation.isPending || (state.locked && !state.result);
  useOwnerScreenBack(
    () => {
      if (!backDisabled) props.onClose();
    },
    true,
    5,
  );
  return (
    <View
      accessibilityLabel="Record external payment"
      className="gap-4 rounded-input border border-border p-4"
    >
      <AppHeader
        title="Collect rent"
        backLabel="Close payment"
        onBack={props.onClose}
        backDisabled={state.mutation.isPending || (state.locked && !state.result)}
      />
      {/* Non-negotiable 7: residents pay the hostel directly; HSM never holds the money. */}
      <PaymentAccess state={state} />
      <PaymentContent {...props} state={state} />
    </View>
  );
}
function PaymentAccess({ state }: { state: State }) {
  // A failed save is shown beside the Confirm button instead (paymentErrorMessage).
  const error = state.authority.error;
  return (
    <>
      {error ? <Copy alert>{safeMessage(error)}</Copy> : null}
      {!state.fresh ? (
        <View className="gap-2">
          <Copy>Pull down to load payment access before viewing or recording money.</Copy>
        </View>
      ) : null}
    </>
  );
}
function PaymentContent({ state, ...props }: Props & { state: State }) {
  if (state.result)
    return (
      <>
        {/* ACC-004: an invoice turns paid only through its approved, receipt-backed balance. */}
        {state.refreshFailed ? (
          <Copy alert>Payment recorded. Pull down for the latest balances.</Copy>
        ) : null}
        {state.fresh ? <RecordedStayReceipt query={state.receipt} /> : null}
      </>
    );
  const busy = state.locked || state.mutation.isPending;
  if (!state.authority.data) return busy ? <PendingPayment state={state} /> : null;
  // The form stays mounted while saving, so a rejected save returns with everything typed.
  return (
    <>
      {busy ? <PendingPayment state={state} /> : null}
      <View style={busy || !state.fresh ? { display: 'none' } : undefined}>
        <StaffPaymentForm
          {...props}
          residentLabel={state.authority.data.stay.displayName}
          saveError={state.mutation.error ? paymentErrorMessage(state.mutation.error) : undefined}
          onRecord={(body) => state.mutation.mutate(body)}
        />
      </View>
    </>
  );
}
function PendingPayment({ state }: { state: State }) {
  return (
    <View className="gap-3">
      <Copy>
        {state.uncertain
          ? 'The outcome is unconfirmed. Keep this original payment for a safe retry.'
          : 'Recording payment…'}
      </Copy>
      <Button
        disabled={!state.fresh || state.mutation.isPending || !state.uncertain}
        label="Retry original payment"
        onPress={() => state.mutation.mutate(state.command)}
      />
    </View>
  );
}
