'use client';
import { useState } from 'react';
import {
  type ManualStayInput,
  type branchInventorySchema,
  type roomTypeSummarySchema,
} from '@hsm/contracts';
import type { z } from 'zod';
import { AdmissionTargetFields, AdmissionTargetSubmit } from './admission-target-fields';
type Room = z.infer<typeof branchInventorySchema>['rooms'][number];
type Props = {
  branchId: string;
  roomType: z.infer<typeof roomTypeSummarySchema>;
  rooms: Room[];
  disabled: boolean;
  onRoom: (id: string) => void;
  onChoose: (target: ManualStayInput['target'], label: string) => void;
};
export function AdmissionTargetChoice(props: Props) {
  const revision = props.rooms.map((room) => ({
    id: room.id,
    branchId: room.branchId,
    roomTypeId: room.roomTypeId,
    label: room.label,
    status: room.status,
    archivedAt: room.archivedAt,
  }));
  return (
    <Choice
      key={props.branchId + ':' + JSON.stringify(props.roomType) + ':' + JSON.stringify(revision)}
      {...props}
    />
  );
}
function Choice(props: Props) {
  const [roomId, setRoom] = useState(''),
    [kind, setKind] = useState('');
  const rooms = activeRooms(props);
  const room = rooms.find((value) => value.id === roomId);
  const modes =
    props.roomType.inventoryMode === 'per_bed'
      ? ['bed']
      : props.roomType.inventoryMode === 'whole_room'
        ? ['room']
        : ['bed', 'room'];
  function changeRoom(value: string) {
    if (props.disabled) return;
    setRoom(value);
    props.onRoom(value);
  }
  if (props.roomType.branchId !== props.branchId || props.roomType.archivedAt)
    return <p role="alert">Refresh branch inventory before choosing an admission target.</p>;
  return (
    <section aria-label="Choose admission target" className="space-y-3">
      <p>
        Select a physical room or bed. Current admission availability is checked by the server when
        admission is confirmed.
      </p>
      <fieldset disabled={props.disabled} className="space-y-3">
        <legend className="font-semibold">{props.roomType.name}</legend>
        <AdmissionTargetFields
          rooms={rooms}
          roomId={roomId}
          kind={kind}
          modes={modes}
          onRoom={changeRoom}
          onKind={(value) => {
            if (!props.disabled) setKind(value);
          }}
        />
        <AdmissionTargetSubmit
          key={roomId + ':' + kind + ':' + JSON.stringify(room?.seats)}
          room={room}
          kind={kind}
          modes={modes}
          disabled={props.disabled}
          roomTypeLabel={props.roomType.name}
          onChoose={props.onChoose}
        />
      </fieldset>
    </section>
  );
}

function activeRooms(props: Props) {
  return props.rooms.filter(
    (value) =>
      value.branchId === props.branchId &&
      value.roomTypeId === props.roomType.id &&
      !value.archivedAt &&
      value.status === 'active',
  );
}
