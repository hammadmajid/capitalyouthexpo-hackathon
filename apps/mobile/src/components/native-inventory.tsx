import { AppHeader } from './navigation/header';
import { Skeleton } from './loading/skeleton';
import {
  NativeInventoryNavigationProvider,
  useNativeInventoryNavigationLocked,
} from './native-inventory-navigation';
import { useState, type ReactNode } from 'react';
import { Text, TextInput, View } from 'react-native';
import { BedDouble, CalendarSearch, CreditCard, Receipt, Wallet } from 'lucide-react-native';

import { ToolFrame, type Tool } from './inventory-tools';
import { RoomBoard } from './room-board';
import { BoardTools } from './board-tools';
import { inventoryStateInputSchema } from '@hsm/contracts';
import { ApiFailure } from '@hsm/api-client';
import { safeMessage } from '../lib/messages';
import { Button, Copy } from './ui';
import { NativePaymentSettings } from './native-payment-settings';
import { NativeBedBoard } from './bed-board';
import { NativeRentBoard } from './rent-board';
import { NativePaymentReview } from './payment-review';
import { nativeScopeDenied } from './use-hostel-bookings';
import { useNativeInventory, type NativeInventoryCommand } from './use-native-inventory';
import {
  NativeInventoryRows,
  nativeInventorySelectionAvailable,
  type NativeInventorySelection,
} from './native-inventory-rows';
// `embedded`: opened from the branch section chips, so it starts open with no own header.
type Props = { actorId: string; branchId: string; accessUnavailable?: boolean; embedded?: boolean };
export function NativeInventory(props: Props) {
  return (
    <NativeInventoryNavigationProvider key={props.actorId + ':' + props.branchId}>
      <Inventory {...props} />
    </NativeInventoryNavigationProvider>
  );
}
function Inventory({ actorId, branchId, accessUnavailable = false, embedded = false }: Props) {
  const navigationLocked = useNativeInventoryNavigationLocked();
  const [open, setOpen] = useState(embedded),
    [tool, setTool] = useState<string>(),
    [selection, setSelection] = useState<NativeInventorySelection>(),
    [reason, setReason] = useState(''),
    [status, setStatus] = useState<NativeInventoryCommand['status']>(),
    [saved, setSaved] = useState(false);
  const { query, mutation, paging, clearKeys } = useNativeInventory(actorId, branchId, open, () => {
    setSelection(undefined);
    setReason('');
    setStatus(undefined);
    setSaved(true);
  });
  function cancel() {
    if (mutation.isPending) return;
    setSelection(undefined);
    setReason('');
    setStatus(undefined);
    mutation.reset();
    clearKeys();
  }
  if (!open) return <Button secondary label="View rooms and beds" onPress={() => setOpen(true)} />;
  const denied = [query.error, mutation.error].find(
    (error) =>
      nativeScopeDenied(error) || (error instanceof ApiFailure && error.code === 'NOT_FOUND'),
  );
  if (denied)
    return (
      <View className="gap-3">
        <Copy alert>{safeMessage(denied)}</Copy>
      </View>
    );
  if (query.isPending) return <Skeleton kind="table" label="Loading branch inventory…" />;
  const data = query.data;
  if (!data)
    return (
      <View className="gap-3">
        <Copy alert>{safeMessage(query.error)}</Copy>

        {paging.typeCursor || paging.roomCursor || paging.bedCursor ? (
          <Button secondary label="Restore inventory first pages" onPress={paging.firstTypes} />
        ) : null}
      </View>
    );
  const canEdit = data.permissions.includes('inventory_edit'),
    disabled = accessUnavailable || query.isFetching || Boolean(query.error) || mutation.isPending;
  const available = selection && nativeInventorySelectionAvailable(data, selection);
  const parsed = inventoryStateInputSchema.safeParse({ status, reason });
  // Operations only runs the hostel day to day. Rooms, prices and staff are added or edited in
  // Hostel Setup; each tool here keeps its permission gate.
  const tools: ToolEntry[] = [
    ...(data.permissions.includes('stay_manage')
      ? [
          {
            key: 'bed-board',
            label: 'Occupancy on a date',
            short: 'By date',
            Icon: CalendarSearch,
            render: () => <NativeBedBoard actorId={actorId} branchId={branchId} />,
          },
        ]
      : []),
    ...(data.permissions.includes('finance_view')
      ? [
          {
            key: 'rent-board',
            label: 'View Rent Board',
            short: 'Rent board',
            Icon: Wallet,
            render: () => <NativeRentBoard actorId={actorId} branchId={branchId} />,
          },
          {
            key: 'proofs',
            label: 'Review payment proofs',
            short: 'Payment proofs',
            Icon: Receipt,
            render: () => (
              <NativePaymentReview
                actorId={actorId}
                branchId={branchId}
                canDecide={data.permissions.includes('payment_record')}
              />
            ),
          },
        ]
      : []),
    // The Owner sets payment methods in Hostel Setup > Policies; Managers view them here.
    ...(!data.canConfigureManagers && data.permissions.includes('booking_manage')
      ? [
          {
            key: 'payment-settings',
            framed: true,
            label: 'View payment settings',
            short: 'Payment methods',
            Icon: CreditCard,
            render: () => (
              <NativePaymentSettings actorId={actorId} branchId={branchId} owner={false} />
            ),
          },
        ]
      : []),
    // The former Rooms & rent list (room types, prices, availability) stays one tap away.
    {
      key: 'room-types',
      label: 'Room types, prices and availability',
      short: 'Room types',
      Icon: BedDouble,
      render: () => null,
    },
  ];
  // CHG-048: with stay_manage the visual Bed Board is the tab's home; without it the
  // room list stays the home, as before.
  const board = data.permissions.includes('stay_manage');
  const listOpen = tool === 'room-types' || (!tool && !board);
  const toolsDisabled = disabled || Boolean(selection) || navigationLocked;
  const footer = (
    <BoardTools
      tools={tools.filter((entry) => board || entry.key !== 'room-types')}
      onOpen={setTool}
      disabled={toolsDisabled}
    />
  );
  return (
    <View className="gap-4">
      {embedded ? null : (
        <AppHeader
          title="Rooms and beds"
          backLabel="Close rooms and beds"
          onBack={() => {
            cancel();
            setOpen(false);
            setSaved(false);
          }}
          backDisabled={mutation.isPending || navigationLocked}
        />
      )}
      {embedded ? null : (
        <Text accessibilityRole="header" className="font-heading text-body text-text">
          Branch rooms and beds
        </Text>
      )}
      {saved ? <Copy>Saved</Copy> : null}
      {query.error ? <Copy alert>Could not refresh · actions paused</Copy> : null}
      {mutation.error ? <Copy alert>{safeMessage(mutation.error)}</Copy> : null}
      <InventoryToolbox tool={tool} setTool={setTool} tools={tools} />
      {!tool && board ? <RoomBoard actorId={actorId} branchId={branchId} /> : null}
      {!tool && !board ? footer : null}
      {listOpen ? (
        <>
          {tool ? (
            <AppHeader
              title="Room types"
              backLabel="Back to Bed Board"
              onBack={() => {
                cancel();
                setTool(undefined);
              }}
              backDisabled={mutation.isPending || navigationLocked}
            />
          ) : null}
          {!canEdit ? <Copy>View only</Copy> : null}
          <NativeInventoryRows
            actorId={actorId}
            branchId={branchId}
            data={data}
            canEdit={canEdit}
            disabled={disabled}
            actionsDisabled={disabled || navigationLocked}
            navigationDisabled={disabled || Boolean(selection) || navigationLocked}
            paging={paging}
            onSelect={(value) => {
              if (disabled || navigationLocked || !canEdit) return;
              cancel();
              setSelection(value);
              setSaved(false);
            }}
          />
          {selection && !available ? (
            <Copy alert>This inventory is no longer available for this edit.</Copy>
          ) : null}
          {selection && available && canEdit ? (
            <View className="gap-3">
              <Copy>Availability for {selection.label}</Copy>
              {(['active', 'inactive', 'maintenance'] as const).map((value) => (
                <Button
                  key={value}
                  secondary={status !== value}
                  disabled={disabled}
                  label={'Set ' + value}
                  onPress={() => {
                    if (!disabled) setStatus(value);
                  }}
                />
              ))}
              <TextInput
                accessibilityLabel="Inventory availability reason"
                value={reason}
                onChangeText={setReason}
                maxLength={500}
                multiline
                editable={!disabled}
                className="min-h-12 rounded-input border border-border bg-inputSurface px-4 py-3 font-body text-body text-text"
              />
              <Button
                label={mutation.isPending ? 'Saving availability…' : 'Save availability'}
                disabled={disabled || !parsed.success}
                onPress={() => {
                  if (!disabled && parsed.success)
                    mutation.mutate({ kind: selection.kind, id: selection.id, ...parsed.data });
                }}
              />
            </View>
          ) : null}
          {selection ? (
            <Button
              secondary
              disabled={mutation.isPending}
              label="Keep availability unchanged"
              onPress={cancel}
            />
          ) : null}
        </>
      ) : null}
    </View>
  );
}
// `framed`: the tool has no close control of its own, so the grid adds a back header.
type ToolEntry = Tool & { render: () => ReactNode; framed?: boolean };
function InventoryToolbox({
  tool,
  setTool,
  tools,
}: {
  tool: string | undefined;
  setTool: (key: string | undefined) => void;
  tools: ToolEntry[];
}) {
  const open = tools.find((entry) => entry.key === tool && entry.key !== 'room-types');
  if (!open) return null;
  return (
    <ToolFrame close={() => setTool(undefined)}>
      {open.framed ? (
        <AppHeader
          title={open.short}
          backLabel="Back to Bed Board"
          onBack={() => setTool(undefined)}
        />
      ) : null}
      {open.render()}
    </ToolFrame>
  );
}
