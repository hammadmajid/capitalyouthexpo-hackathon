import { useState } from 'react';
import { Text, View } from 'react-native';
import { Bus } from 'lucide-react-native';
import { saveTransportBillingPolicy } from '@hsm/api-client';
import {
  configuredTransportSubscription,
  separateTransportPolicy,
  type TransportBillingPolicy,
  type TransportBillingPolicyInput,
} from '@hsm/contracts';
import { BillingChoice } from './transport-billing-fields';
import { mobileColors as colors } from '@hsm/ui';
import { safeMessage } from '../../lib/messages';
import { Button, Copy } from '../ui';
import { NativeCommandRecovery } from '../services/command-recovery';
import { useNativeCommand } from '../services/use-command';
import { TransportCard } from './transport-ui';

type Policy = TransportBillingPolicyInput['transportBilling'];
type Mode = NonNullable<Policy['offer']>['mode'];
const modes = [
  [
    'included',
    'Included in rent',
    'Residents can use the hostel’s published routes as part of rent.',
  ],
  [
    'separate',
    'Billed separately',
    'Residents see one monthly transport fee and can request a subscription.',
  ],
] as const;
const titleStyle = 'font-heading text-sm text-heading';
const detailStyle = 'font-body text-xs text-secondary';

export function TransportBillingPolicyForm({
  actorId,
  branchId,
  version,
  policy,
  canEdit,
}: {
  actorId: string;
  branchId: string;
  version: string;
  policy: Policy | undefined;
  canEdit: boolean;
}) {
  const subscription = configuredTransportSubscription(policy);
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<Mode | undefined>();
  const save = useNativeCommand(
    'transport-billing-policy:' + branchId,
    actorId,
    (client, input: TransportBillingPolicyInput, key) =>
      saveTransportBillingPolicy(client, branchId, input, key),
    [['billing-policy', actorId, branchId]],
  );
  const edit = () => {
    setMode(policy?.offer?.mode);
    setEditing(true);
  };
  const requested: TransportBillingPolicy | undefined =
    mode === 'included'
      ? { offer: { mode }, ...(subscription ? { monthlySubscription: subscription } : {}) }
      : mode === 'separate' && subscription
        ? separateTransportPolicy(subscription)
        : undefined;
  const disabled = save.isPending || save.unresolved;
  const offer = policy?.offer;

  return (
    <TransportCard>
      <View className="flex-row items-center gap-2">
        <Bus color={colors.primary} size={21} />
        <Text accessibilityRole="header" className="font-heading text-body text-heading">
          Transport billing
        </Text>
      </View>
      {canEdit && editing ? (
        <View className="gap-3">
          <Text className={titleStyle}>How should residents pay for transport?</Text>
          {modes.map(([value, label, detail]) => (
            <BillingChoice
              key={value}
              label={label}
              detail={detail}
              selected={mode === value}
              disabled={disabled}
              onPress={() => setMode(value)}
            />
          ))}
          {mode === 'separate' && !subscription ? (
            <Text className={detailStyle}>
              Set up the monthly subscription in Amenities &amp; Services → Transport routes first.
            </Text>
          ) : null}
          {mode ? (
            <Text className={detailStyle}>Changes apply to new agreements and subscriptions.</Text>
          ) : null}
          <NativeCommandRecovery command={save} />
          {save.isError ? <Copy alert>{safeMessage(save.error)}</Copy> : null}
          <Button
            label={save.isPending ? 'Saving…' : 'Save transport billing'}
            disabled={disabled || !requested}
            onPress={() => {
              if (requested)
                save.mutate(
                  { policyVersionId: version, transportBilling: requested },
                  { onSuccess: () => setEditing(false) },
                );
            }}
          />
          <Button label="Cancel" secondary disabled={disabled} onPress={() => setEditing(false)} />
        </View>
      ) : (
        <>
          <View className="gap-1 rounded-input border border-border bg-icy p-3">
            <Text className={titleStyle}>
              {offer?.mode === 'included'
                ? 'Included in rent'
                : offer
                  ? 'Billed separately'
                  : 'Pricing not set'}
            </Text>
            <Text className={detailStyle}>
              {offer?.mode === 'included'
                ? 'Residents can use the hostel’s published routes as part of rent.'
                : offer?.mode === 'separate'
                  ? 'Residents can request the monthly subscription set up in Amenities & Services.'
                  : 'Choose how residents pay for transport.'}
            </Text>
          </View>
          {canEdit ? <Button label="Edit transport billing" secondary onPress={edit} /> : null}
        </>
      )}
    </TransportCard>
  );
}
