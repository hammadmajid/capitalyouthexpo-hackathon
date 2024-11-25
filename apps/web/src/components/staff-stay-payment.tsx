'use client';
import { useStaffStayPayment } from '../lib/use-staff-stay-payment';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
import { StaffPaymentForm } from './staff-payment-form';
import { RecordedStayReceipt } from './recorded-stay-receipt';
type Props = {
  actorId: string;
  branchId: string;
  stayId: string;
  transportOnly?: boolean;
  unavailable: boolean;
  onClose: () => void;
};
type State = ReturnType<typeof useStaffStayPayment>;
export function StaffStayPayment(props: Props) {
  return <Payment key={props.actorId + ':' + props.branchId + ':' + props.stayId} {...props} />;
}
function Payment(props: Props) {
  const state = useStaffStayPayment(props.actorId, props.branchId, props.stayId, props.unavailable);
  return (
    <section
      aria-label="Record external payment"
      className="space-y-4 rounded-input border border-hsm-border p-4"
    >
      <h3 className="font-semibold">Record external payment</h3>
      <p>
        Record money received directly by the hostel. HSM does not receive or transfer this money.
      </p>
      <PaymentAccess state={state} unavailable={props.unavailable} />
      <PaymentContent {...props} state={state} />
      <Button
        variant="ghost"
        disabled={state.mutation.isPending || (state.locked && !state.result)}
        onClick={props.onClose}
      >
        Close payment
      </Button>
    </section>
  );
}
function PaymentAccess({ state, unavailable }: { state: State; unavailable: boolean }) {
  const error = state.authority.error ?? state.mutation.error;
  return (
    <>
      {error ? <p role="alert">{errorMessage(error)}</p> : null}
      {!state.fresh ? (
        <div className="space-y-2">
          <p role="status">Refresh current payment access before viewing or recording money.</p>
          <Button
            variant="secondary"
            disabled={unavailable || state.authority.isFetching}
            onClick={() => void state.authority.refetch()}
          >
            Refresh payment access
          </Button>
        </div>
      ) : null}
    </>
  );
}
function PaymentContent({ state, ...props }: Props & { state: State }) {
  if (state.result)
    return (
      <>
        <p role="status">
          Payment recorded. An invoice is paid only through its approved receipt-backed balance.
        </p>
        {state.refreshFailed ? (
          <p role="alert">Payment recorded. Refresh the Stay for the latest balances.</p>
        ) : null}
        {state.fresh ? <RecordedStayReceipt query={state.receipt} /> : null}
      </>
    );
  if (state.locked || state.mutation.isPending) return <PendingPayment state={state} />;
  if (!state.fresh || !state.authority.data) return null;
  return (
    <StaffPaymentForm
      {...props}
      residentLabel={state.authority.data.stay.displayName}
      onRecord={(body) => state.mutation.mutate(body)}
    />
  );
}
function PendingPayment({ state }: { state: State }) {
  return (
    <div className="space-y-3">
      <p role="status">
        {state.uncertain
          ? 'The outcome is unconfirmed. Keep this original payment for a safe retry.'
          : 'Recording payment…'}
      </p>
      <Button
        disabled={!state.fresh || state.mutation.isPending || !state.uncertain}
        onClick={() => state.mutation.mutate(state.command)}
      >
        Retry original payment
      </Button>
    </div>
  );
}
