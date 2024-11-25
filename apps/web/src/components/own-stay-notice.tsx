'use client';
import { useState, type FormEvent } from 'react';
import { stayNoticeInputSchema } from '@hsm/contracts';
import { useOwnStayNotice } from '../lib/use-own-stay-notice';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
type Props = { actorId: string; stayId: string; unavailable: boolean; onClose: () => void };
export function OwnStayNotice(props: Props) {
  return <Notice key={props.actorId + ':' + props.stayId} {...props} />;
}
function Notice(props: Props) {
  const state = useOwnStayNotice(props.actorId, props.stayId, props.unavailable),
    error = state.authority.error ?? state.mutation.error;
  return (
    <section
      aria-label="Departure notice"
      className="space-y-4 rounded-input border border-hsm-border p-4"
    >
      <h3 className="font-semibold">Give departure notice</h3>
      <p>Giving notice does not check you out or release your accommodation.</p>
      {error ? <p role="alert">{errorMessage(error)}</p> : null}
      {!state.fresh ? (
        <div className="space-y-2">
          <p role="status">Checking current Stay access…</p>
          <Button
            variant="secondary"
            disabled={props.unavailable || state.authority.isFetching}
            onClick={() => void state.authority.refetch()}
          >
            Refresh notice access
          </Button>
        </div>
      ) : null}
      {state.result ? (
        <>
          <p role="status">Departure notice recorded.</p>
          {state.fresh ? <NoticeTiming result={state.result} /> : null}
          {state.refreshFailed ? (
            <p role="alert">Notice recorded. Refresh your Stay to see the latest details.</p>
          ) : null}
        </>
      ) : state.locked ? (
        <div className="space-y-3">
          <p role="status">
            {state.uncertain
              ? 'The outcome is unconfirmed. Keep this original notice for a safe retry.'
              : 'Submitting departure notice…'}
          </p>
          <Button
            disabled={!state.fresh || state.mutation.isPending || !state.uncertain}
            onClick={() => state.mutation.mutate(state.command)}
          >
            Retry original notice
          </Button>
        </div>
      ) : state.visible && state.eligible && state.authority.data ? (
        <NoticeForm
          key={state.authority.data.version}
          version={state.authority.data.version}
          disabled={!state.fresh || state.mutation.isPending}
          onSubmit={(body) => state.mutation.mutate(body)}
        />
      ) : state.fresh ? (
        <p>Departure notice is available for an active, checked-in Stay.</p>
      ) : null}
      <Button
        variant="ghost"
        disabled={state.mutation.isPending || (state.locked && !state.result)}
        onClick={props.onClose}
      >
        Close notice
      </Button>
    </section>
  );
}
function NoticeTiming({
  result,
}: {
  result: NonNullable<ReturnType<typeof useOwnStayNotice>['result']>;
}) {
  const plan = result.plan;
  return (
    <div className="space-y-1" aria-label="Recorded notice timing">
      <p>Requested departure: {plan.requestedCheckoutDate}</p>
      <p>Earliest compliant departure: {plan.earliestCompliantCheckoutDate}</p>
      <p>Required notice: {plan.requiredNoticeDays} days</p>
      <p>Notice provided: {plan.providedNoticeDays} days</p>
      <p>Notice shortfall: {plan.shortfallDays} days</p>
      <p>Emergency: {plan.isEmergency ? 'Yes' : 'No'}</p>
    </div>
  );
}
function NoticeForm({
  version,
  disabled,
  onSubmit,
}: {
  version: number;
  disabled: boolean;
  onSubmit: (body: unknown) => void;
}) {
  const [date, setDate] = useState(''),
    [reason, setReason] = useState(''),
    [emergency, setEmergency] = useState(false),
    [invalid, setInvalid] = useState(false);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (disabled) return;
    const parsed = stayNoticeInputSchema.safeParse({
      expectedVersion: version,
      requestedCheckoutDate: date,
      isEmergency: emergency,
      ...(reason.trim() ? { reason } : {}),
    });
    if (!parsed.success) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onSubmit(parsed.data);
  }
  return (
    <form aria-label="Give departure notice" onSubmit={submit} className="space-y-3">
      {invalid ? (
        <p role="alert">Enter a valid departure date and a reason for an emergency departure.</p>
      ) : null}
      <fieldset disabled={disabled} className="space-y-3">
        <label className="field-label">
          Requested departure date
          <input
            type="date"
            className="field-input"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <label className="field-label">
          <input
            type="checkbox"
            checked={emergency}
            onChange={(event) => setEmergency(event.target.checked)}
          />{' '}
          Emergency departure
        </label>
        <label className="field-label">
          Departure reason
          <textarea
            className="field-input"
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <Button type="submit" disabled={disabled}>
          Submit departure notice
        </Button>
      </fieldset>
    </form>
  );
}
