import { AppHeader } from './navigation/header';
import { Layers, ScrollText } from 'lucide-react-native';
import { IconChip, InvFact } from './inventory-tools';
import { Skeleton } from './loading/skeleton';
import { useNativeInventoryNavigationLock } from './native-inventory-navigation';
import { useState } from 'react';
import { View } from 'react-native';
import { billingDraftFrom, billingPolicyFromDraft, type BillingDraft } from '@hsm/api-client';
import { TransportBillingPolicyForm } from './transport/transport-billing-policy';
import type { BillingSettingsTarget } from '@hsm/contracts';
import { safeMessage } from '../lib/messages';
import { Button, Copy } from './ui';
import { useNativeBillingPolicy } from './use-native-billing-policy';
import { NativeBillingPolicyForm, NativeBillingPolicySummary } from './native-billing-policy-form';
type Props = {
  actorId: string;
  target: BillingSettingsTarget;
  accessUnavailable?: boolean;
  roomTypeName?: string;
  // On its own screen (Manager tool): starts open; the screen's Back closes it.
  standalone?: boolean;
};
// Says plainly which rules apply, so a room type's own rules are not confused with the branch's.
function sourceText(level: string, forRoomType: boolean) {
  if (level === 'room_type') return 'Own rules for this room type';
  if (level === 'branch') return forRoomType ? 'Uses the branch rules' : 'Branch rules';
  if (level === 'hostel') return 'Uses the hostel rules';
  return 'Platform default rules';
}
type Edit = { draft: BillingDraft; base: string | null };
export function NativeBillingPolicy(props: Props) {
  return (
    <Policy
      key={
        props.actorId + ':' + props.target.branchId + ':' + (props.target.roomTypeId ?? 'branch')
      }
      {...props}
    />
  );
}
function Policy({
  actorId,
  target,
  accessUnavailable = false,
  roomTypeName,
  standalone = false,
}: Props) {
  const [open, setOpen] = useState(standalone),
    [edit, setEdit] = useState<Edit>(),
    [validation, setValidation] = useState(''),
    [saved, setSaved] = useState(false);
  const { query, mutation } = useNativeBillingPolicy(
    actorId,
    target,
    open,
    accessUnavailable,
    () => {
      setEdit(undefined);
      setValidation('');
      setSaved(true);
    },
  );
  useNativeInventoryNavigationLock(open || mutation.isPending);
  const title = roomTypeName ? 'Billing policy for ' + roomTypeName : 'Billing policy';
  // A failed load hides the values until a pull; a failed save keeps the draft beside its message.
  const error = query.error,
    busy = mutation.isPending || query.isFetching;
  const current =
    !accessUnavailable && !query.isPending && !query.isFetching && !error ? query.data : undefined;
  const conflict = Boolean(edit && current && edit.base !== (current.effectiveVersion?.id ?? null));
  function start() {
    if (!current?.canEdit || busy) return;
    setEdit({
      draft: billingDraftFrom(current.effectiveVersion?.policy),
      base: current.effectiveVersion?.id ?? null,
    });
    setValidation('');
    setSaved(false);
  }
  function save() {
    if (!edit || !current?.canEdit || busy || conflict) return;
    setValidation('');
    setSaved(false);
    try {
      mutation.mutate(billingPolicyFromDraft(edit.draft));
    } catch {
      setValidation(
        'Complete all required settings with supported values. Enter exact PKR amounts and whole numbers of days.',
      );
    }
  }
  if (!open)
    return (
      <IconChip
        Icon={ScrollText}
        text={roomTypeName ? 'Rent rules' : 'Billing'}
        disabled={accessUnavailable}
        label={roomTypeName ? 'View billing policy for ' + roomTypeName : 'View billing policy'}
        onPress={() => setOpen(true)}
      />
    );
  return (
    <View className="gap-4">
      {standalone ? null : (
        <AppHeader
          title={title}
          backLabel={
            roomTypeName ? 'Close billing policy for ' + roomTypeName : 'Close billing policy'
          }
          backDisabled={mutation.isPending}
          onBack={() => {
            setOpen(false);
            setEdit(undefined);
            setValidation('');
            setSaved(false);
            mutation.reset();
          }}
        />
      )}
      {saved ? <Copy>Billing policy version saved.</Copy> : null}
      {mutation.error && !error ? <Copy alert>{safeMessage(mutation.error)}</Copy> : null}
      {accessUnavailable ? (
        <Copy alert>Pull down to load branch access before viewing billing settings.</Copy>
      ) : error ? (
        <View className="gap-3">
          <Copy alert>{safeMessage(error)}</Copy>
        </View>
      ) : !current ? (
        <Skeleton kind="form" label="Loading billing policy…" />
      ) : (
        <>
          {/* While editing, only the form shows (no duplicate summary). */}
          {edit && current.canEdit ? null : current.effectiveVersion ? (
            <>
              <View className="flex-row items-center gap-2">
                <View className="flex-1">
                  <InvFact Icon={Layers}>
                    {sourceText(current.effectiveVersion.level, target.roomTypeId !== undefined)}
                  </InvFact>
                </View>
              </View>
              <NativeBillingPolicySummary policy={current.effectiveVersion.policy} />
            </>
          ) : (
            <>
              <Copy>No rent policy yet · set one before admitting residents</Copy>
            </>
          )}
          {!edit &&
          target.roomTypeId === undefined &&
          current.effectiveVersion &&
          (current.canEditTransport || current.effectiveVersion.policy.transportBilling) ? (
            <TransportBillingPolicyForm
              key={current.effectiveVersion.id}
              actorId={actorId}
              branchId={target.branchId}
              version={current.effectiveVersion.id}
              policy={current.effectiveVersion.policy.transportBilling}
              canEdit={current.canEditTransport === true}
            />
          ) : null}
          {!current.canEdit ? <Copy>View only · the Owner edits rent rules</Copy> : null}
          {conflict ? (
            <View className="gap-3">
              <Copy alert>
                Billing settings changed. Your draft is retained. Use the current values before
                saving a new version.
              </Copy>
              <Button label="Use current values" disabled={busy} onPress={start} />
            </View>
          ) : null}
          {edit && current.canEdit ? (
            <NativeBillingPolicyForm
              draft={edit.draft}
              change={(draft) => setEdit({ ...edit, draft })}
              disabled={busy || conflict}
              save={save}
              cancel={() => {
                setEdit(undefined);
                setValidation('');
              }}
              error={validation}
            />
          ) : current.canEdit ? (
            <Button label="Edit billing policy" disabled={busy} onPress={start} />
          ) : null}
        </>
      )}
    </View>
  );
}
