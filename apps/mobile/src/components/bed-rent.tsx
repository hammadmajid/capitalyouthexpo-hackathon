import { NumericTextInput as TextInput } from './grouped-number-input';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  billingFormPaisa,
  billingFormRupees,
  marketplacePrice,
  readBedRent,
  scheduleBedRent,
} from '@hsm/api-client';
import { DISPLAY_TIME_ZONE, type BedRentInput } from '@hsm/contracts';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { Button, Copy } from './ui';
import { DateField } from './date-field';
import { useNativeCommand } from './services/use-command';
import { NativeCommandRecovery } from './services/command-recovery';
import { Skeleton } from './loading/skeleton';
// CHG-056: this physical bed's own price, never a shared room/type price editor.
export function BedRent(props: { actorId: string; branchId: string; bedId: string }) {
  const { actorId, branchId, bedId } = props;
  const [editing, setEditing] = useState(false),
    [amount, setAmount] = useState(''),
    [security, setSecurity] = useState('0'),
    [date, setDate] = useState(() =>
      new Intl.DateTimeFormat('en-CA', { timeZone: DISPLAY_TIME_ZONE }).format(new Date()),
    ),
    [invalid, setInvalid] = useState(false);
  const query = useQuery({
    queryKey: ['bed-rent', actorId, branchId, bedId],
    retry: false,
    gcTime: 0,
    queryFn: async () => readBedRent(await actorClient(actorId), branchId, bedId),
  });
  const run = useNativeCommand(
    'BedRent:save:' + bedId,
    actorId,
    (client, input: BedRentInput, key) => scheduleBedRent(client, branchId, bedId, input, key),
    [
      ['bed-rent', actorId, branchId, bedId],
      ['branch-inventory-pages', actorId, branchId],
      ['floor-rooms', actorId, branchId],
    ],
  );
  useEffect(() => {
    if (run.isSuccess) setEditing(false);
  }, [run.isSuccess]);
  if (query.error) return <Copy alert>{safeMessage(query.error)}</Copy>;
  if (!query.data) return <Skeleton kind="inline" label="Loading bed rent" />;
  const data = query.data,
    busy = run.isPending || run.unresolved;
  function save() {
    try {
      const monthlyRentPaisa = billingFormPaisa(amount);
      setInvalid(false);
      const depositPaisa = billingFormPaisa(security);
      run.mutate({ monthlyRentPaisa, depositPaisa, effectiveFrom: date });
    } catch {
      setInvalid(true);
    }
  }
  return (
    <View className="gap-3" accessibilityLabel="Bed rent and security">
      <Copy>
        {data.bedLabel} ·{' '}
        {data.current
          ? marketplacePrice(data.current.monthlyRentPaisa) + ' / month'
          : 'Rent not set'}
      </Copy>
      {data.current?.depositPaisa !== undefined ? (
        <Copy>Security {marketplacePrice(data.current.depositPaisa)}</Copy>
      ) : null}
      <NativeCommandRecovery command={run} />
      {run.error ? <Copy alert>{safeMessage(run.error)}</Copy> : null}
      {editing ? (
        <>
          <TextInput
            accessibilityLabel="Monthly rent for this bed (PKR)"
            placeholder="Monthly rent (PKR)"
            value={amount}
            onChangeText={setAmount}
            editable={!busy}
            keyboardType="decimal-pad"
            className="min-h-12 rounded-input border border-border bg-inputSurface px-4 font-body text-body text-text"
          />
          <TextInput
            accessibilityLabel="Security deposit for this bed (PKR)"
            placeholder="Security deposit (PKR)"
            value={security}
            onChangeText={setSecurity}
            editable={!busy}
            keyboardType="decimal-pad"
            className="min-h-12 rounded-input border border-border bg-inputSurface px-4 font-body text-body text-text"
          />
          <DateField label="Effective from" value={date} onChange={setDate} disabled={busy} />
          <Copy>Existing residents keep their agreed amounts.</Copy>
          {invalid ? <Copy alert>Enter rent and security in rupees.</Copy> : null}
          <Button label="Save pricing" disabled={busy || !amount.trim() || !date} onPress={save} />
          <Button secondary label="Cancel" disabled={busy} onPress={() => setEditing(false)} />
        </>
      ) : data.canEdit ? (
        <Button
          secondary
          label="Edit rent & security"
          disabled={busy}
          onPress={() => {
            setAmount(data.current ? billingFormRupees(data.current.monthlyRentPaisa) : '');
            setSecurity(billingFormRupees(data.current?.depositPaisa ?? 0));
            setEditing(true);
          }}
        />
      ) : null}
    </View>
  );
}
