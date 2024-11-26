import { useState } from 'react';
import { TextInput, View, Switch } from 'react-native';
import { stayNoticeInputSchema } from '@hsm/contracts';
import { useOwnStayNotice } from './use-own-stay-notice';
import { safeMessage } from '../lib/messages';
import { DateField } from './date-field';
import { Button, Copy } from './ui';
type Props = { actorId: string; stayId: string; unavailable: boolean; onClose: () => void };
export function OwnStayNotice(props: Props) {
  return <Notice key={props.actorId + ':' + props.stayId} {...props} />;
}
function Notice(props: Props) {
  const state = useOwnStayNotice(props.actorId, props.stayId, props.unavailable),
    error = state.authority.error ?? state.mutation.error;
  return (
    <View
      accessibilityLabel="Departure notice"
      className="gap-3 rounded-input border border-border p-4"
    >
      <Copy>Give departure notice</Copy>
      <Copy>Giving notice does not check you out or release your accommodation.</Copy>
      {error ? <Copy alert>{safeMessage(error)}</Copy> : null}
      {!state.fresh ? (
        <>
          <Copy>Checking current Stay access…</Copy>
        </>
      ) : null}
      {state.result ? (
        <>
          <Copy>Departure notice recorded.</Copy>
          {state.fresh ? <NoticeTiming result={state.result} /> : null}
          {state.refreshFailed ? (
            <Copy alert>Notice recorded. Pull down to see the latest details.</Copy>
          ) : null}
        </>
      ) : state.locked ? (
        <>
          <Copy>
            {state.uncertain
              ? 'The outcome is unconfirmed. Keep this original notice for a safe retry.'
              : 'Submitting departure notice…'}
          </Copy>
          <Button
            label="Retry original notice"
            disabled={!state.fresh || state.mutation.isPending || !state.uncertain}
            onPress={() => state.mutation.mutate(state.command)}
          />
        </>
      ) : state.visible && state.eligible && state.authority.data ? (
        <NoticeForm
          key={state.authority.data.version}
          version={state.authority.data.version}
          disabled={!state.fresh || state.mutation.isPending}
          onSubmit={(body) => state.mutation.mutate(body)}
        />
      ) : state.fresh ? (
        <Copy>Departure notice is available for an active, checked-in Stay.</Copy>
      ) : null}
      <Button
        label="Close notice"
        secondary
        disabled={state.mutation.isPending || (state.locked && !state.result)}
        onPress={props.onClose}
      />
    </View>
  );
}
function NoticeTiming({
  result,
}: {
  result: NonNullable<ReturnType<typeof useOwnStayNotice>['result']>;
}) {
  const plan = result.plan;
  return (
    <View accessibilityLabel="Recorded notice timing" className="gap-1">
      <Copy>Requested departure: {plan.requestedCheckoutDate}</Copy>
      <Copy>Earliest compliant departure: {plan.earliestCompliantCheckoutDate}</Copy>
      <Copy>Required notice: {plan.requiredNoticeDays} days</Copy>
      <Copy>Notice provided: {plan.providedNoticeDays} days</Copy>
      <Copy>Notice shortfall: {plan.shortfallDays} days</Copy>
      <Copy>Emergency: {plan.isEmergency ? 'Yes' : 'No'}</Copy>
    </View>
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
  function submit() {
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
    <View className="gap-3">
      {invalid ? (
        <Copy alert>Enter a valid departure date and a reason for an emergency departure.</Copy>
      ) : null}
      <DateField
        label="Requested departure date"
        value={date}
        onChange={setDate}
        disabled={disabled}
      />
      <Copy>Emergency departure</Copy>
      <Switch
        accessibilityLabel="Emergency departure"
        value={emergency}
        disabled={disabled}
        onValueChange={setEmergency}
      />
      <Copy>Departure reason</Copy>
      <TextInput
        accessibilityLabel="Departure reason"
        value={reason}
        editable={!disabled}
        multiline
        maxLength={500}
        onChangeText={setReason}
        className="min-h-12 rounded-input border border-border bg-inputSurface px-4 text-text"
      />
      <Button label="Submit departure notice" disabled={disabled} onPress={submit} />
    </View>
  );
}
