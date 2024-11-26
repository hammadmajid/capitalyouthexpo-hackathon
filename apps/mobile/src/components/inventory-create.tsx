import { BedDouble, DoorOpen, Layers } from 'lucide-react-native';
import { FilterChip, ToolGrid } from './inventory-tools';
import { AppHeader } from './navigation/header';
import { useToolOpen } from './inventory-tools';
import { useState } from 'react';
import { View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  retainedCommand,
  createInventoryRoom,
  createInventoryBed,
  saveInventoryRoomType,
  type readBranchInventory,
} from '@hsm/api-client';
import {
  roomInputSchema,
  seatInputSchema,
  type RoomInput,
  type SeatInput,
  type RoomTypeInput,
} from '@hsm/contracts';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { nativeScopeDenied } from './use-hostel-bookings';
import { useNativeInventoryNavigationLock } from './native-inventory-navigation';
import { InventoryTypeForm } from './inventory-type-form';
import { FlowForm } from './flow-form';
import { Button, Copy } from './ui';

type Inventory = Awaited<ReturnType<typeof readBranchInventory>>;
type Command =
  | { kind: 'type'; input: RoomTypeInput }
  | { kind: 'room'; input: RoomInput }
  | { kind: 'bed'; roomId: string; input: SeatInput };
type Props = {
  actorId: string;
  branchId: string;
  data: Inventory;
  unavailable: boolean;
  blocked: boolean;
};
export function NativeInventoryCreate(props: Props) {
  return <Panel key={props.actorId + ':' + props.branchId} {...props} />;
}
function Panel({ actorId, branchId, data, unavailable, blocked }: Props) {
  const command = retainedCommand(
    JSON.stringify(['inventory-create', actorId, branchId]),
    randomUUID,
  );
  const [open, setOpen] = useToolOpen(command.unresolved),
    [kind, setKind] = useState<Command['kind']>(),
    [parent, setParent] = useState(''),
    [saved, setSaved] = useState(false);
  const cache = useQueryClient();
  const mutation = useMutation({
    retry: false,
    gcTime: 0,
    mutationFn: (body: Command) =>
      command.submit(body, async (input, key) => {
        const client = await actorClient(actorId);
        switch (input.kind) {
          case 'type':
            return saveInventoryRoomType(client, branchId, input.input, key);
          case 'room':
            return createInventoryRoom(client, branchId, input.input, key);
          case 'bed':
            return createInventoryBed(client, branchId, input.roomId, input.input, key);
        }
      }),
    onSuccess: async () => {
      setKind(undefined);
      setParent('');
      setSaved(true);
      await cache.invalidateQueries({ queryKey: ['branch-inventory-pages', actorId, branchId] });
    },
  });
  const locked = mutation.isPending || command.unresolved;
  useNativeInventoryNavigationLock(open || locked);
  const canCreateType = data.permissions.includes('pricing_edit'),
    canCreatePhysical = data.permissions.includes('inventory_edit'),
    denied = nativeScopeDenied(mutation.error),
    disabled = unavailable || locked || denied;
  if (!canCreateType && !canCreatePhysical) return null;
  if (!open)
    return (
      <Button
        secondary
        label="Create inventory"
        disabled={unavailable || blocked}
        onPress={() => setOpen(true)}
      />
    );
  async function send(body: Command) {
    if (disabled) return;
    setSaved(false);
    await mutation.mutateAsync(body);
  }
  const parents =
    kind === 'room'
      ? data.roomTypes
          .filter((row) => !row.archivedAt)
          .map((row) => ({ id: row.id, label: row.name }))
      : data.rooms
          .filter((row) => !row.archivedAt)
          .map((row) => ({ id: row.id, label: row.label }));
  // With a single possible parent there is nothing to choose, so it is preselected.
  const chosen = parents.some((row) => row.id === parent)
    ? parent
    : parents.length === 1
      ? (parents[0]?.id ?? '')
      : '';
  return (
    <View className="gap-3">
      <AppHeader
        title="Add rooms"
        backLabel="Close inventory creation"
        backDisabled={locked}
        onBack={() => {
          setOpen(false);
          setKind(undefined);
          setParent('');
          setSaved(false);
          mutation.reset();
        }}
      />
      <Copy>Stays private until published</Copy>
      {saved ? (
        <Copy>Inventory saved by the server. Review the inventory pages for the new record.</Copy>
      ) : null}
      {mutation.error ? <Copy alert>{safeMessage(mutation.error)}</Copy> : null}
      {command.unresolved && !mutation.isPending ? (
        <Button
          label="Retry original inventory creation"
          disabled={unavailable || denied}
          onPress={() => mutation.mutate(command.original<Command>())}
        />
      ) : null}
      {!command.unresolved && !denied ? (
        <>
          {/* One tap picks what to add; the chosen option stays highlighted. */}
          <ToolGrid
            tools={[
              ...(canCreateType
                ? [{ key: 'type', label: 'Create room type', short: 'Room type', Icon: Layers }]
                : []),
              ...(canCreatePhysical
                ? [
                    { key: 'room', label: 'Create individual room', short: 'Room', Icon: DoorOpen },
                    { key: 'bed', label: 'Create individual bed', short: 'Bed', Icon: BedDouble },
                  ]
                : []),
            ]}
            disabled={disabled}
            selected={kind}
            onOpen={(value) => {
              setKind(value as typeof kind);
              setParent('');
              setSaved(false);
            }}
          />
          {kind === 'type' && canCreateType ? (
            <InventoryTypeForm
              disabled={disabled}
              submit={(input) => send({ kind: 'type', input })}
            />
          ) : null}
          {(kind === 'room' || kind === 'bed') && canCreatePhysical ? (
            <View key={kind} className="gap-3">
              <Copy>{kind === 'room' ? 'Room type' : 'Room'}</Copy>
              {parents.length ? (
                <View className="flex-row flex-wrap gap-2">
                  {parents.map((row) => (
                    <FilterChip
                      key={row.id}
                      text={row.label}
                      label={'Create in ' + row.label}
                      selected={chosen === row.id}
                      onPress={() => {
                        if (!disabled) setParent(row.id);
                      }}
                    />
                  ))}
                </View>
              ) : (
                <Copy>
                  {kind === 'room' ? 'No room type here yet' : 'No room here yet'} · go back and
                  open another page
                </Copy>
              )}
              <FlowForm
                key={kind + ':' + chosen}
                disabled={disabled || !chosen}
                resetAfterSubmit={false}
                initialValues={{ status: 'inactive' }}
                fields={[
                  {
                    name: 'label',
                    label: kind === 'room' ? 'Room number' : 'Bed label',
                  },
                  {
                    name: 'status',
                    label: 'Starts as',
                    options: ['inactive', 'active', 'maintenance'],
                    optionLabels: {
                      inactive: 'Inactive',
                      active: 'Active',
                      maintenance: 'Maintenance',
                    },
                  },
                ]}
                label={kind === 'room' ? 'Save new room' : 'Save new bed'}
                submit={async (values) => {
                  if (kind === 'room')
                    await send({
                      kind,
                      input: roomInputSchema.parse({ ...values, roomTypeId: chosen }),
                    });
                  else await send({ kind, roomId: chosen, input: seatInputSchema.parse(values) });
                }}
              />
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
