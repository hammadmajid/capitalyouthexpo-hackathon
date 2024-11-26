import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { CalendarClock } from 'lucide-react-native';
import { randomUUID } from 'expo-crypto';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { readInventoryAccess, reissueStayInvoice } from '@hsm/api-client';
import type { ResidentInvoiceBalance } from '@hsm/contracts';
import { mobileColors as c } from '@hsm/ui';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { DateField } from './date-field';
import { Field } from './staff/staff-shared';
import { Button, Copy } from './ui';
// CHG-053: only a wholly unpaid, unadjusted open bill can be cancelled and reissued.
export function canReissue(value: ResidentInvoiceBalance) {
  return (
    (value.state === 'issued' || value.state === 'overdue') &&
    value.allocatedPaisa === 0 &&
    value.debitAdjustmentsPaisa === 0 &&
    value.creditAdjustmentsPaisa === 0
  );
}
// Owner-only (canConfigureManagers marks the Owner); the server rechecks the role and the bill.
export function BillReissue(props: {
  actorId: string;
  branchId?: string | undefined;
  stayId: string;
  balance: ResidentInvoiceBalance;
}) {
  const [open, setOpen] = useState(false),
    [dueDate, setDueDate] = useState(props.balance.dueDate),
    [reason, setReason] = useState('');
  const key = useRef(randomUUID());
  const queries = useQueryClient();
  const access = useQuery({
    queryKey: ['inventory-access', props.actorId, props.branchId],
    retry: false,
    // Reuse the screen's own access read instead of fetching it again.
    staleTime: 60_000,
    enabled: Boolean(props.branchId),
    queryFn: async () =>
      readInventoryAccess(await actorClient(props.actorId), props.branchId ?? ''),
  });
  const save = useMutation({
    mutationFn: async () =>
      reissueStayInvoice(
        await actorClient(props.actorId),
        props.branchId ?? '',
        props.stayId,
        props.balance.invoiceId,
        { dueDate, reason: reason.trim() },
        key.current,
      ),
    onSuccess: async () => {
      key.current = randomUUID();
      setOpen(false);
      // The bed's rent colour and the board counts change with the bill, so reload them too.
      await Promise.all(
        ['private-invoices', 'bed-detail', 'bed-board', 'rent-board'].map((root) =>
          queries.invalidateQueries({ queryKey: [root, props.actorId] }),
        ),
      );
    },
  });
  if (!access.data?.canConfigureManagers || !canReissue(props.balance)) return null;
  if (!open) return <ChangeDateLink onPress={() => setOpen(true)} />;
  return (
    <View className="gap-3 pl-9" accessibilityLabel="Change due date">
      <DateField label="New due date" value={dueDate} onChange={setDueDate} />
      <Field label="Why" value={reason} onChangeText={setReason} maxLength={500} />
      {save.error ? <Copy alert>{safeMessage(save.error)}</Copy> : null}
      <Button
        label={save.isPending ? 'Saving…' : 'Cancel bill & reissue'}
        disabled={save.isPending || !reason.trim() || dueDate === props.balance.dueDate}
        onPress={() => save.mutate()}
      />
      <Button secondary label="Back" disabled={save.isPending} onPress={() => setOpen(false)} />
    </View>
  );
}
function ChangeDateLink({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Change due date"
      onPress={onPress}
      className="flex-row items-center gap-2 pl-9 py-2"
    >
      <CalendarClock size={20} color={c.primary} />
      <Text className="font-heading text-body text-primary">Change due date</Text>
    </Pressable>
  );
}
