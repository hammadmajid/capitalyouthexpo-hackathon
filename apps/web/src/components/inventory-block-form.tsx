'use client';
import { useState, type FormEvent } from 'react';
import {
  inventoryBlockInputSchema,
  inventoryBlockReleaseSchema,
  type InventoryBlockInput,
  type branchInventorySchema,
} from '@hsm/contracts';
import type { z } from 'zod';
import { Button } from './ui/button';
type Rooms = z.infer<typeof branchInventorySchema>['rooms'];
export function InventoryBlockForm({
  rooms,
  pending,
  disabled = false,
  onSave,
  onCancel,
  roomRevision = 0,
  bedRevision = 0,
  onRoomChange,
}: {
  rooms: Rooms;
  roomRevision?: number;
  bedRevision?: number;
  onRoomChange?: (roomId: string) => void;
  pending: boolean;
  disabled?: boolean;
  onSave: (input: InventoryBlockInput) => void;
  onCancel: () => void;
}) {
  const [target, setTarget] = useState({ roomId: '', bedId: '', roomRevision, bedRevision });
  const [targetKind, setTargetKind] = useState('');
  const roomId = target.roomRevision === roomRevision ? target.roomId : '';
  const bedId =
    target.roomRevision === roomRevision && target.bedRevision === bedRevision ? target.bedId : '';
  function chooseRoom(value: string) {
    setTarget({ roomId: value, bedId: '', roomRevision, bedRevision });
    onRoomChange?.(value);
  }
  function chooseBed(value: string) {
    setTarget({ roomId, bedId: value, roomRevision, bedRevision });
  }
  const [start, setStart] = useState(''),
    [end, setEnd] = useState(''),
    [kind, setKind] = useState(''),
    [reason, setReason] = useState('');
  const [invalid, setInvalid] = useState(false);
  const selectedRoom = rooms.find((room) => room.id === roomId && !room.archivedAt);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || disabled) return;
    const input = inventoryBlockInputSchema.safeParse({
      target: targetKind === 'bed' ? { kind: 'bed', roomId, bedId } : { kind: targetKind, roomId },
      range: { moveInDate: start, moveOutDate: end },
      kind,
      reason,
    });
    const live =
      selectedRoom &&
      (targetKind !== 'bed' ||
        selectedRoom.seats.some((bed) => bed.id === bedId && !bed.archivedAt));
    setInvalid(!input.success || !live);
    if (input.success && live) onSave(input.data);
  }
  return (
    <form onSubmit={submit}>
      <fieldset disabled={pending || disabled} className="space-y-3">
        <legend className="font-semibold">Create an inventory block</legend>
        <label className="field-label">
          Room to block
          <select
            className="field-input"
            value={roomId}
            required
            onChange={(event) => {
              chooseRoom(event.target.value);
            }}
          >
            <option value="">Choose a room</option>
            {rooms
              .filter((room) => !room.archivedAt)
              .map((room) => (
                <option key={room.id} value={room.id}>
                  {room.label}
                </option>
              ))}
          </select>
        </label>
        <label className="field-label">
          Block target
          <select
            className="field-input"
            value={targetKind}
            required
            onChange={(event) => {
              setTargetKind(event.target.value);
              chooseBed('');
            }}
          >
            <option value="">Choose a target</option>
            <option value="room">Whole room (all beds)</option>
            <option value="bed">Single bed</option>
          </select>
        </label>
        {targetKind === 'bed' ? (
          <label className="field-label">
            Bed to block
            <select
              className="field-input"
              value={bedId}
              required
              onChange={(event) => chooseBed(event.target.value)}
            >
              <option value="">Choose a bed</option>
              {selectedRoom?.seats
                .filter((bed) => !bed.archivedAt)
                .map((bed) => (
                  <option key={bed.id} value={bed.id}>
                    {bed.label} (number {bed.ordinal})
                  </option>
                ))}
            </select>
          </label>
        ) : null}
        <label className="field-label">
          Blocked from
          <input
            className="field-input"
            type="date"
            value={start}
            required
            onChange={(event) => setStart(event.target.value)}
          />
        </label>
        <label className="field-label">
          Available again on
          <input
            className="field-input"
            type="date"
            value={end}
            required
            onChange={(event) => setEnd(event.target.value)}
          />
        </label>
        <p>The end date is excluded. Other bookings, blocks and room settings still apply.</p>
        <label className="field-label">
          Block category
          <select
            className="field-input"
            value={kind}
            required
            onChange={(event) => setKind(event.target.value)}
          >
            <option value="">Choose a category</option>
            <option value="manual">Manual reservation</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </label>
        <label className="field-label">
          Private block reason
          <textarea
            className="field-input"
            value={reason}
            required
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        {invalid ? (
          <p role="alert">Choose current inventory, valid dates, a category and a reason.</p>
        ) : null}
        <div className="flex gap-3">
          <Button type="submit">{pending ? 'Creating block…' : 'Create block'}</Button>
        </div>
      </fieldset>
      <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>
        Cancel block edit
      </Button>
    </form>
  );
}
export function ReleaseBlockForm({
  label,
  pending,
  disabled = false,
  onSave,
  onCancel,
}: {
  label: string;
  pending: boolean;
  disabled?: boolean;
  onSave: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState(''),
    [invalid, setInvalid] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || disabled) return;
    const input = inventoryBlockReleaseSchema.safeParse({ reason });
    setInvalid(!input.success);
    if (input.success) onSave(input.data.reason);
  }
  return (
    <form onSubmit={submit}>
      <fieldset disabled={pending || disabled} className="space-y-3">
        <legend className="font-semibold">Release {label}</legend>
        <p>Release this block. Other reservations and availability settings still apply.</p>
        <label className="field-label">
          Release reason
          <textarea
            className="field-input"
            value={reason}
            required
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        {invalid ? <p role="alert">Provide a reason for releasing this block.</p> : null}
        <div className="flex gap-3">
          <Button type="submit">{pending ? 'Releasing block…' : 'Confirm release'}</Button>
        </div>
      </fieldset>
      <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>
        Cancel block edit
      </Button>
    </form>
  );
}
