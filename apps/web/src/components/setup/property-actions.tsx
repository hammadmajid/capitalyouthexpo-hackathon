'use client';
import { useState } from 'react';
import {
  archiveInventory,
  archivePropertyBuilding,
  archivePropertyFloor,
  renameProperty,
} from '@hsm/api-client';
import { browserClient } from '../../lib/client';
import { errorMessage } from '../../lib/messages';
import { Button } from '../ui/button';
import { CommandRecovery } from '../services/command-recovery';
import { useCommand } from '../services/use-command';
import { floorRoomsKey, type FloorRooms } from './use-floor-rooms';
type Kind = 'building' | 'floor' | 'room' | 'seat';
const warnings: Record<Kind, string> = {
  building: 'Remove active children first. History is kept.',
  floor: 'Remove active children first. History is kept.',
  room: 'This also removes its beds. History is kept.',
  seat: 'History is kept.',
};
// ROOM-002 / BED-001: rename or remove; removal archives and keeps referenced history
// (non-negotiable 6), never a hard delete. Mobile parity with property-actions.tsx.
export function PropertyActions(props: {
  data: FloorRooms;
  kind: Kind;
  id: string;
  label: string;
  name: string;
  version?: number;
  onRemoved?: () => void;
}) {
  const [mode, setMode] = useState<'closed' | 'edit' | 'delete'>('closed');
  const [name, setName] = useState(props.name);
  const { data, kind, id, label, version } = props;
  const refresh = [
    floorRoomsKey(data.actorId, data.branchId),
    ['branch-inventory-pages', data.actorId, data.branchId],
    ['bed-board', data.actorId, data.branchId],
  ];
  const remove = useCommand(
    'property-delete:' + kind + ':' + id,
    async (input: { confirmed: true; expectedVersion?: number }, key) => {
      const client = browserClient(),
        reason = 'Removed from hostel setup';
      if (kind === 'building' || kind === 'floor') {
        if (input.expectedVersion === undefined) throw new Error('Refresh property details first.');
        const archive = kind === 'building' ? archivePropertyBuilding : archivePropertyFloor;
        return archive(
          client,
          data.branchId,
          id,
          { expectedVersion: input.expectedVersion, reason },
          key,
        );
      }
      return archiveInventory(client, data.branchId, kind, id, reason, key);
    },
    refresh,
  );
  const rename = useCommand(
    'property-rename:' + kind + ':' + id,
    (input: { name: string; expectedName: string }, key) =>
      renameProperty(browserClient(), data.branchId, kind, id, input, key),
    refresh,
  );
  const busy = remove.isPending || remove.unresolved || rename.isPending || rename.unresolved;
  if (mode === 'closed')
    return (
      <span className="flex gap-1">
        <Button
          variant="ghost"
          aria-label={'Rename ' + label}
          onClick={() => (setName(props.name), setMode('edit'))}
        >
          Rename
        </Button>
        <Button variant="ghost" aria-label={'Delete ' + label} onClick={() => setMode('delete')}>
          Delete
        </Button>
      </span>
    );
  return (
    <div
      role="group"
      aria-label={mode === 'edit' ? 'Rename ' + label : 'Delete ' + label}
      className="space-y-2"
    >
      {mode === 'edit' ? (
        <>
          <label className="field-label">
            New name
            <input
              className="field-input"
              value={name}
              maxLength={kind === 'room' || kind === 'seat' ? 80 : 120}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          {rename.isError ? <p role="alert">{errorMessage(rename.error)}</p> : null}
          <CommandRecovery command={rename} />
          <Button
            disabled={busy || !name.trim() || name.trim() === props.name}
            onClick={() =>
              rename.mutate(
                { name: name.trim(), expectedName: props.name },
                { onSuccess: () => setMode('closed') },
              )
            }
          >
            Save name
          </Button>
        </>
      ) : (
        <>
          <p>{'Delete ' + label + '? ' + warnings[kind]}</p>
          {remove.isError ? <p role="alert">{errorMessage(remove.error)}</p> : null}
          <CommandRecovery command={remove} />
          <Button
            disabled={busy}
            onClick={() =>
              remove.mutate(
                { confirmed: true, ...(version === undefined ? {} : { expectedVersion: version }) },
                {
                  onSuccess: () => {
                    setMode('closed');
                    props.onRemoved?.();
                  },
                },
              )
            }
          >
            Confirm delete
          </Button>
        </>
      )}
      <Button variant="secondary" disabled={busy} onClick={() => setMode('closed')}>
        Cancel
      </Button>
    </div>
  );
}
