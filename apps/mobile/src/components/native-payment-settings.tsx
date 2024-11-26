import { useToolOpen } from './inventory-tools';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Landmark, UserPlus, Wallet } from 'lucide-react-native';
import {
  PaymentAccountCard,
  PaymentAdd,
  PaymentChoice,
  PaymentField,
  PaymentPart,
  paymentMethodLabels as methodLabels,
  paymentSettingsStyles as styles,
} from './payment-settings-parts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import type { UpfrontSettings } from '@hsm/contracts';
import {
  addPaymentInstruction,
  archivePaymentInstruction,
  branchPaymentInstructions,
  readUpfrontSettings,
  updateUpfrontSettings,
} from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { Button, Copy } from './ui';
const requirements = [
  ['none', 'No upfront payment'],
  ['deposit', 'Deposit'],
  ['first_rent', 'First rent'],
  ['deposit_and_first_rent', 'Deposit and first rent'],
] as const;
const methods = ['bank_transfer', 'jazzcash', 'easypaisa', 'cash', 'other'] as const;
// BKG-007 / BR-01: Owner upfront policy and direct-to-hostel payment destinations.
export function NativePaymentSettings({
  actorId,
  branchId,
  owner,
  onUnsavedChange,
}: {
  actorId: string;
  branchId: string;
  owner: boolean;
  // Hostel Setup holds Continue while an account is typed but not added yet.
  onUnsavedChange?: (unsaved: boolean) => void;
}) {
  const cache = useQueryClient(),
    keys = useRef(new Map<string, string>());
  const [open, setOpen] = useToolOpen(),
    [method, setMethod] = useState<(typeof methods)[number]>('bank_transfer'),
    [title, setTitle] = useState(''),
    [account, setAccount] = useState('');
  const typingNow = Boolean(title.trim() || account.trim());
  useEffect(() => onUnsavedChange?.(typingNow), [typingNow, onUnsavedChange]);
  const settingsKey = ['upfront-settings', actorId, branchId],
    instructionsKey = ['payment-instructions', actorId, branchId];
  const settings = useQuery({
    queryKey: settingsKey,
    enabled: open,
    gcTime: 0,
    queryFn: async () => readUpfrontSettings(await actorClient(actorId), branchId),
  });
  const instructions = useQuery({
    queryKey: instructionsKey,
    enabled: open,
    gcTime: 0,
    queryFn: async () => branchPaymentInstructions(await actorClient(actorId), branchId),
  });
  const mutation = useMutation({
    gcTime: 0,
    mutationFn: async (
      command:
        | { kind: 'settings'; input: UpfrontSettings }
        | { kind: 'add'; input: Record<string, unknown> }
        | { kind: 'archive'; id: string },
    ) => {
      const intent = JSON.stringify(command),
        key = keys.current.get(intent) ?? randomUUID();
      keys.current.set(intent, key);
      const client = await actorClient(actorId);
      if (command.kind === 'settings')
        return updateUpfrontSettings(client, branchId, command.input, key);
      return command.kind === 'add'
        ? addPaymentInstruction(client, branchId, command.input, key)
        : archivePaymentInstruction(client, branchId, command.id, key);
    },
    onSuccess: async (_result, command) => {
      keys.current.delete(JSON.stringify(command));
      if (command.kind === 'add') {
        setTitle('');
        setAccount('');
      }
      await Promise.all([
        cache.invalidateQueries({ queryKey: settingsKey, exact: true }),
        cache.invalidateQueries({ queryKey: instructionsKey, exact: true }),
      ]);
    },
  });
  if (!open)
    return <Button secondary label="View payment settings" onPress={() => setOpen(true)} />;
  const current = settings.data;
  const busy = mutation.isPending;
  return (
    <View className="gap-4" accessibilityLabel="Payment settings">
      {/* Non-negotiable 7: residents pay the hostel directly. */}
      <Copy>Residents pay the hostel directly</Copy>
      {settings.isError ? <Copy alert>{safeMessage(settings.error)}</Copy> : null}
      {instructions.isError ? <Copy alert>{safeMessage(instructions.error)}</Copy> : null}
      {mutation.isError ? <Copy alert>{safeMessage(mutation.error)}</Copy> : null}
      {current ? (
        <View style={styles.upfront}>
          <PaymentPart Icon={Wallet} title="Payment before check-in" raised />
          <View style={styles.choices}>
            {requirements.map(([value, label]) => (
              <PaymentChoice
                key={value}
                text={label}
                label={'Upfront: ' + label}
                selected={current.requirement === value}
                disabled={!owner || busy}
                onPress={() => {
                  if (owner && !busy && current.requirement !== value)
                    mutation.mutate({
                      kind: 'settings',
                      input: { ...current, requirement: value },
                    });
                }}
              />
            ))}
          </View>
        </View>
      ) : null}
      <View style={styles.section}>
        <PaymentPart Icon={Landmark} title="Accounts" />
        {instructions.data?.data.length === 0 ? <Copy>No accounts yet</Copy> : null}
        {instructions.data?.data.map((row) => (
          <PaymentAccountCard
            key={row.id}
            row={row}
            owner={owner}
            busy={busy}
            remove={() => mutation.mutate({ kind: 'archive', id: row.id })}
          />
        ))}
      </View>
      {owner ? (
        <View style={styles.section}>
          <PaymentPart Icon={UserPlus} title="Add account" />
          <View style={styles.choices}>
            {methods.map((value) => (
              <PaymentChoice
                key={value}
                text={methodLabels[value] ?? value}
                label={'Method: ' + (methodLabels[value] ?? value)}
                selected={method === value}
                method={value}
                onPress={() => setMethod(value)}
              />
            ))}
          </View>
          <PaymentField
            kind="name"
            accessibilityLabel="Account title"
            placeholder="Account name"
            maxLength={120}
            value={title}
            onChangeText={setTitle}
          />
          <PaymentField
            kind="account"
            accessibilityLabel="Account number, IBAN or wallet number"
            placeholder="Account, IBAN or wallet number"
            maxLength={80}
            value={account}
            onChangeText={setAccount}
          />
          <PaymentAdd
            disabled={!title.trim() || !account.trim() || busy}
            onPress={() =>
              mutation.mutate({
                kind: 'add',
                input: {
                  method,
                  accountTitle: title.trim(),
                  accountIdentifier: account.trim(),
                  instructions: null,
                },
              })
            }
          />
        </View>
      ) : null}
    </View>
  );
}
