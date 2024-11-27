import { useState } from 'react';
import { Text, View } from 'react-native';
import { Pencil, Plus } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import {
  billingFormPaisa,
  billingFormRupees,
  marketplacePrice,
  readBillingSettings,
  saveTransportBillingPolicy,
} from '@hsm/api-client';
import {
  configuredTransportSubscription,
  separateTransportPolicy,
  transportMonthlySubscriptionSchema,
  type BillingPolicy,
  type TransportBillingPolicy,
  type TransportBillingPolicyInput,
} from '@hsm/contracts';
import { mobileColors as colors } from '@hsm/ui';
import { actorClient } from '../../lib/runtime';
import { safeMessage } from '../../lib/messages';
import { NavIconButton } from '../navigation/header';
import { SetupButton, SetupText } from '../owner-wizard-ui';
import { NativeCommandRecovery } from '../services/command-recovery';
import { useNativeCommand } from '../services/use-command';
import { BillingChoice, BillingNumberField } from './transport-billing-fields';

export function TransportMonthlySubscription({
  actorId,
  branchId,
}: {
  actorId: string;
  branchId: string;
}) {
  const settings = useQuery({
    queryKey: ['billing-policy', actorId, branchId, 'branch'],
    retry: false,
    gcTime: 0,
    queryFn: async () => readBillingSettings(await actorClient(actorId), { branchId }),
  });
  if (settings.isPending) return null;
  if (settings.isError) return <SetupText alert>{safeMessage(settings.error)}</SetupText>;
  const version = settings.data.effectiveVersion;
  if (!version || !settings.data.canEditTransport) return null;
  return (
    <SubscriptionFields
      key={version.id}
      actorId={actorId}
      branchId={branchId}
      version={version.id}
      policy={version.policy.transportBilling}
      rentCycle={version.policy.cycle}
    />
  );
}

function SubscriptionFields({
  actorId,
  branchId,
  version,
  policy,
  rentCycle,
}: {
  actorId: string;
  branchId: string;
  version: string;
  policy: TransportBillingPolicy | undefined;
  rentCycle: BillingPolicy['cycle'];
}) {
  const combined = ['calendar_month', 'anniversary_month'].includes(rentCycle.kind);
  const existing = configuredTransportSubscription(policy);
  const rules = existing ?? (policy && 'dueDay' in policy ? policy : undefined);
  const [editing, setEditing] = useState(false);
  const [fee, setFee] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [refundable, setRefundable] = useState<boolean>();
  const save = useNativeCommand(
    'monthly-transport-subscription:' + branchId,
    actorId,
    (client, body: TransportBillingPolicyInput, key) =>
      saveTransportBillingPolicy(client, branchId, body, key),
    [
      ['billing-policy', actorId, branchId],
      ['transport-routes', actorId, branchId],
      ['public-routes', branchId],
    ],
  );
  const busy = save.isPending || save.unresolved;
  const edit = () => {
    setFee(existing ? billingFormRupees(existing.monthlyChargePaisa) : '');
    setDueDay(
      combined
        ? String(rentCycle.kind === 'calendar_month' ? rentCycle.dueDay : 1)
        : rules
          ? String(rules.dueDay)
          : '',
    );
    setRefundable(rules?.refundable);
    setEditing(true);
  };
  const parsed = transportMonthlySubscriptionSchema.safeParse({
    monthlyChargePaisa: readFee(fee),
    dueDay: /^\d{1,2}$/.test(dueDay) ? Number(dueDay) : 0,
    refundable,
    proration: rules?.proration ?? { kind: 'calendar_days', rounding: 'half_up' },
  });
  const Icon = existing ? Pencil : Plus;
  return (
    <View className="gap-2 border-t border-border pt-2">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="font-heading text-sm text-heading">Monthly subscription</Text>
        {editing ? null : (
          <NavIconButton
            label={existing ? 'Edit monthly subscription' : 'Add monthly subscription'}
            onPress={edit}
          >
            <Icon size={18} color={colors.primary} />
          </NavIconButton>
        )}
      </View>
      {editing ? (
        <>
          <View className="flex-row flex-wrap gap-2">
            <BillingNumberField
              label="Monthly fee (PKR)"
              name="Monthly transport fee in PKR"
              example="e.g. 3000"
              decimal
              value={fee}
              disabled={busy}
              change={setFee}
            />
            {combined ? null : (
              <BillingNumberField
                label="Due day (1–31)"
                name="Transport due day"
                example="e.g. 10"
                value={dueDay}
                disabled={busy}
                change={setDueDay}
              />
            )}
          </View>
          {combined ? <SetupText muted>Billed with rent</SetupText> : null}
          <Text className="font-heading text-sm text-heading">Refund rule</Text>
          <View className="flex-row flex-wrap gap-2">
            <BillingChoice
              label="Refundable"
              selected={refundable === true}
              disabled={busy}
              onPress={() => setRefundable(true)}
            />
            <BillingChoice
              label="Non-refundable"
              selected={refundable === false}
              disabled={busy}
              onPress={() => setRefundable(false)}
            />
          </View>
          {!rules ? <SetupText muted>Partial months are charged by days covered.</SetupText> : null}
          <NativeCommandRecovery command={save} />
          {save.error ? <SetupText alert>{safeMessage(save.error)}</SetupText> : null}
          <SetupButton
            label={save.isPending ? 'Saving…' : 'Save subscription'}
            disabled={busy || !parsed.success}
            onPress={() => {
              if (!parsed.success) return;
              const offer = policy?.offer;
              const transportBilling =
                offer?.mode === 'separate'
                  ? separateTransportPolicy(parsed.data)
                  : { monthlySubscription: parsed.data, ...(offer ? { offer } : {}) };
              save.mutate(
                { policyVersionId: version, transportBilling },
                { onSuccess: () => setEditing(false) },
              );
            }}
          />
          <SetupButton
            secondary
            label="Cancel subscription edit"
            disabled={busy}
            onPress={() => setEditing(false)}
          />
        </>
      ) : existing ? (
        <>
          <SetupText muted>
            {marketplacePrice(existing.monthlyChargePaisa)} per month ·{' '}
            {combined ? 'Billed with rent' : 'Due day ' + existing.dueDay}
          </SetupText>
          {policy?.offer?.mode === 'separate' ? null : (
            <SetupText muted>Choose Billed separately in Billing Policy to offer it.</SetupText>
          )}
        </>
      ) : (
        <SetupText muted>Not set</SetupText>
      )}
    </View>
  );
}

function readFee(value: string) {
  try {
    return billingFormPaisa(value);
  } catch {
    return undefined;
  }
}
