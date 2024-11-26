import { useEffect, useState } from 'react';
import { Pressable, TextInput, Text } from 'react-native';
import { Pencil, Trash2, Check } from 'lucide-react-native';
import {
  archiveInventory,
  archivePropertyBuilding,
  archivePropertyFloor,
  renameProperty,
} from '@hsm/api-client';
import { mobileOwnerColors as c } from '@hsm/ui';
import { safeMessage } from '../lib/messages';
import { useNativeCommand } from './services/use-command';
import { NativeCommandRecovery } from './services/command-recovery';
import { Copy } from './ui';
import { PropertyActionDialog, PropertyActionRow } from './property-action-dialog';
import type { FloorRooms } from './use-floor-rooms';

// ROOM-002 / BED-001: pencil opens rename/removal; archival retains referenced history.
export function PropertyActions(props: {
  data: FloorRooms;
  kind: 'building' | 'floor' | 'room' | 'seat';
  id: string;
  label: string;
  name: string;
  version?: number;
  onRemoved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'menu' | 'edit' | 'delete'>('menu');
  const [name, setName] = useState(props.name);
  const { data, kind, id, label, version } = props;
  const run = useNativeCommand(
    'property-delete:' + kind + ':' + id,
    data.actorId,
    async (client, input: { confirmed: true; expectedVersion?: number }, key) => {
      const reason = 'Removed from hostel setup';
      if (kind === 'building' || kind === 'floor') {
        if (input.expectedVersion === undefined) throw new Error('Refresh property details first.');
        const command = kind === 'building' ? archivePropertyBuilding : archivePropertyFloor;
        return command(
          client,
          data.branchId,
          id,
          { expectedVersion: input.expectedVersion, reason },
          key,
        );
      }
      return archiveInventory(client, data.branchId, kind, id, reason, key);
    },
    [
      ['floor-rooms', data.actorId, data.branchId],
      ['branch-inventory-pages', data.actorId, data.branchId],
      ['bed-board', data.actorId, data.branchId],
    ],
  );
  const rename = useNativeCommand(
    'property-rename:' + kind + ':' + id,
    data.actorId,
    (client, input: { name: string; expectedName: string }, key) =>
      renameProperty(client, data.branchId, kind, id, input, key),
    [
      ['floor-rooms', data.actorId, data.branchId],
      ['branch-inventory-pages', data.actorId, data.branchId],
      ['bed-board', data.actorId, data.branchId],
    ],
  );
  const busy = run.isPending || run.unresolved || rename.isPending || rename.unresolved;
  useEffect(() => {
    if (run.isSuccess || rename.isSuccess) setOpen(false);
  }, [run.isSuccess, rename.isSuccess]);
  const close = () => {
    if (!busy) setOpen(false);
  };
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={'Edit ' + label}
        onPress={() => {
          setMode('menu');
          setName(props.name);
          setOpen(true);
        }}
        hitSlop={4}
        style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <Pencil size={19} color={c.primary} />
      </Pressable>
      <PropertyActionDialog
        visible={open}
        title={
          mode === 'delete' ? 'Delete ' + label + '?' : mode === 'edit' ? 'Edit name' : props.name
        }
        busy={busy}
        close={close}
        back={mode !== 'menu' ? () => setMode('menu') : undefined}
      >
        {mode === 'menu' ? (
          <>
            <PropertyActionRow
              Icon={Pencil}
              label="Edit name"
              disabled={busy}
              onPress={() => setMode('edit')}
            />
            <PropertyActionRow
              Icon={Trash2}
              danger
              label="Delete"
              disabled={busy}
              onPress={() => setMode('delete')}
            />
          </>
        ) : mode === 'edit' ? (
          <>
            <TextInput
              accessibilityLabel="Name"
              value={name}
              onChangeText={setName}
              editable={!busy}
              maxLength={kind === 'room' || kind === 'seat' ? 80 : 120}
              style={{
                width: '100%',
                minHeight: 52,
                padding: 14,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.surface,
                color: c.text,
                fontSize: 16,
                fontFamily: 'PlusJakartaSans_400Regular',
              }}
            />
            {rename.error ? <Copy alert>{safeMessage(rename.error)}</Copy> : null}
            <NativeCommandRecovery command={rename} />
            <PropertyActionRow
              Icon={Check}
              primary
              label="Save"
              disabled={busy || !name.trim() || name.trim() === props.name}
              onPress={() =>
                rename.mutate(
                  { name: name.trim(), expectedName: props.name },
                  { onSuccess: () => setOpen(false) },
                )
              }
            />
          </>
        ) : (
          <>
            <Text style={{ color: c.secondary, fontSize: 14, lineHeight: 21 }}>
              {kind === 'room'
                ? 'This also removes its beds. History is kept.'
                : kind === 'seat'
                  ? 'History is kept.'
                  : 'Remove active children first. History is kept.'}
            </Text>
            {run.error ? <Copy alert>{safeMessage(run.error)}</Copy> : null}
            <NativeCommandRecovery command={run} />
            <PropertyActionRow
              Icon={Trash2}
              danger
              label="Confirm delete"
              disabled={busy}
              onPress={() =>
                run.mutate(
                  {
                    confirmed: true,
                    ...(version === undefined ? {} : { expectedVersion: version }),
                  },
                  {
                    onSuccess: () => {
                      setOpen(false);
                      props.onRemoved?.();
                    },
                  },
                )
              }
            />
          </>
        )}
      </PropertyActionDialog>
    </>
  );
}
