'use client';
import { useState, type FormEvent } from 'react';
import {
  roomInputSchema,
  seatInputSchema,
  inventoryStateInputSchema,
  inventoryArchiveInputSchema,
  type RoomInput,
  type SeatInput,
} from '@hsm/contracts';
import { Button } from './ui/button';
type RoomType = { id: string; name: string; archivedAt: string | null };
export function PhysicalInventoryEditor({
  roomTypes,
  bed,
  pending,
  unavailable = false,
  onRoom,
  onBed,
  onCancel,
}: {
  roomTypes: RoomType[];
  bed: boolean;
  pending: boolean;
  unavailable?: boolean;
  onRoom: (input: RoomInput) => void;
  onBed: (input: SeatInput) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(''),
    [typeId, setTypeId] = useState(''),
    [status, setStatus] = useState('');
  const [invalid, setInvalid] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || unavailable) return;
    if (bed) {
      const input = seatInputSchema.safeParse({ label, status });
      setInvalid(!input.success);
      if (input.success) onBed(input.data);
    } else {
      const input = roomInputSchema.safeParse({ label, status, roomTypeId: typeId });
      setInvalid(!input.success);
      if (input.success) onRoom(input.data);
    }
  }
  return (
    <form onSubmit={submit}>
      <fieldset disabled={pending} className="space-y-3">
        <legend className="font-semibold">Add physical {bed ? 'bed' : 'room'}</legend>
        {!bed ? (
          <label className="field-label">
            Room type
            <select
              className="field-input"
              value={typeId}
              onChange={(event) => setTypeId(event.target.value)}
              required
            >
              <option value="">Choose room type</option>
              {roomTypes
                .filter((type) => !type.archivedAt)
                .map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
            </select>
          </label>
        ) : null}
        <label className="field-label">
          {bed ? 'Bed' : 'Room'} label
          <input
            className="field-input"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={80}
            required
          />
        </label>
        <label className="field-label">
          Initial availability
          <select
            className="field-input"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            required
          >
            <option value="">Choose availability</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </label>
        {bed ? (
          <p>The server assigns a permanent bed number. Archived numbers are retained.</p>
        ) : null}
        {invalid ? <p role="alert">Choose the required type, label and availability.</p> : null}
        <div className="flex gap-3">
          <Button type="submit" disabled={unavailable}>
            {pending ? 'Saving…' : 'Save ' + (bed ? 'bed' : 'room')}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel edit
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
export function InventoryLifecycleEditor({
  label,
  archive,
  pending,
  unavailable = false,
  onSave,
  onCancel,
}: {
  label: string;
  archive: boolean;
  pending: boolean;
  unavailable?: boolean;
  onSave: (reason: string, status?: 'active' | 'inactive' | 'maintenance') => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState(''),
    [status, setStatus] = useState('');
  const [invalid, setInvalid] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || unavailable) return;
    if (archive) {
      const input = inventoryArchiveInputSchema.safeParse({ reason });
      setInvalid(!input.success);
      if (input.success) onSave(input.data.reason);
    } else {
      const input = inventoryStateInputSchema.safeParse({ reason, status });
      setInvalid(!input.success);
      if (input.success) onSave(input.data.reason, input.data.status);
    }
  }
  return (
    <form onSubmit={submit}>
      <fieldset disabled={pending} className="space-y-3">
        <legend className="font-semibold">
          {archive ? 'Archive ' : 'Change availability: '}
          {label}
        </legend>
        <p>
          {archive
            ? 'Archival preserves history and permanently retires this physical inventory. Room/type archival also retires its beds.'
            : 'Current and future reservations prevent taking this inventory offline.'}{' '}
          Release manual blocks first. Reservations are never cancelled by this action.
        </p>
        {!archive ? (
          <label className="field-label">
            New availability
            <select
              className="field-input"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              required
            >
              <option value="">Choose availability</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </label>
        ) : null}
        <label className="field-label">
          Reason
          <textarea
            className="field-input"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            required
          />
        </label>
        {invalid ? (
          <p role="alert">Provide a reason and a valid availability when changing status.</p>
        ) : null}
        <div className="flex gap-3">
          <Button type="submit" disabled={unavailable}>
            {pending ? 'Saving…' : archive ? 'Confirm archival' : 'Save availability'}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel edit
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
