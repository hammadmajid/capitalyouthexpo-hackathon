'use client';
import { useState } from 'react';
import {
  inventoryTargetSchema,
  type ManualStayInput,
  type branchInventorySchema,
} from '@hsm/contracts';
import type { z } from 'zod';
import { Button } from './ui/button';
type Room = z.infer<typeof branchInventorySchema>['rooms'][number];
type Fields = {
  rooms: Room[];
  roomId: string;
  kind: string;
  modes: string[];
  onRoom: (id: string) => void;
  onKind: (kind: string) => void;
};
export function AdmissionTargetFields(props: Fields) {
  return (
    <>
      <label className="field-label">
        Admission room
        <select
          className="field-input"
          value={props.roomId}
          onChange={(event) => props.onRoom(event.target.value)}
        >
          <option value="">Choose a room</option>
          {props.rooms.map((value) => (
            <option key={value.id} value={value.id}>
              {value.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field-label">
        Admission target type
        <select
          className="field-input"
          value={props.kind}
          onChange={(event) => props.onKind(event.target.value)}
        >
          <option value="">Choose target type</option>
          {props.modes.map((value) => (
            <option key={value} value={value}>
              {value === 'bed' ? 'Individual bed' : 'Whole room'}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
type Submit = {
  room: Room | undefined;
  kind: string;
  modes: string[];
  disabled: boolean;
  roomTypeLabel: string;
  onChoose: (target: ManualStayInput['target'], label: string) => void;
};
export function AdmissionTargetSubmit(props: Submit) {
  const [bedId, setBed] = useState(''),
    [invalid, setInvalid] = useState(false);
  const seats =
    props.room?.seats.filter(
      (value) => value.roomId === props.room?.id && !value.archivedAt && value.status === 'active',
    ) ?? [];
  function choose() {
    if (props.disabled) return;
    const room = props.room,
      seat = seats.find((value) => value.id === bedId);
    const target = readTarget(props.kind, room?.id, bedId);
    const valid =
      target.success && room && props.modes.includes(props.kind) && (props.kind !== 'bed' || seat);
    setInvalid(!valid);
    if (valid)
      props.onChoose(
        target.data,
        props.roomTypeLabel +
          ' · ' +
          room.label +
          (seat && props.kind === 'bed' ? ' · ' + seat.label : ''),
      );
  }
  return (
    <>
      {invalid ? (
        <p role="alert">Choose an active room and an allowed room or bed target.</p>
      ) : null}
      {props.kind === 'bed' ? (
        <AdmissionBedFields
          seats={seats}
          value={bedId}
          disabled={props.disabled}
          onChange={(value) => {
            setBed(value);
            setInvalid(false);
          }}
        />
      ) : null}
      <Button disabled={props.disabled} onClick={choose}>
        Continue with selected target
      </Button>
    </>
  );
}

function AdmissionBedFields(props: {
  seats: Room['seats'];
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field-label">
      Admission bed
      <select
        className="field-input"
        value={props.value}
        onChange={(event) => {
          if (!props.disabled) props.onChange(event.target.value);
        }}
      >
        <option value="">Choose a bed</option>
        {props.seats.map((value) => (
          <option key={value.id} value={value.id}>
            {value.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function readTarget(kind: string, roomId: string | undefined, bedId: string) {
  return inventoryTargetSchema.safeParse(
    kind === 'bed' ? { kind, roomId, bedId } : { kind, roomId },
  );
}
