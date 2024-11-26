'use client';
import { useState, type ReactNode } from 'react';
import { billingFormPaisa } from '@hsm/api-client';
import { inventoryMutationSchema, seatInputSchema } from '@hsm/contracts';
import { errorMessage } from '../../lib/messages';
import { PrivateFileInput } from '../private-file-input';
import { Button } from '../ui/button';
import { GroupedNumberInput } from '../ui/grouped-number-input';
import type { FloorRooms } from './use-floor-rooms';
type FormProps = { data: FloorRooms; done: () => void };
// One form shell: shows the problem, the uncertain-retry button and the save action.
function SetupForm(props: {
  title: string;
  data: FloorRooms;
  save: string;
  blocked?: boolean;
  submit: () => Promise<string | undefined>;
  done: () => void;
  children: ReactNode;
}) {
  const [problem, setProblem] = useState<string>();
  const { command } = props.data;
  const busy = command.isPending || command.unresolved || Boolean(props.blocked);
  async function send() {
    try {
      const failure = await props.submit();
      setProblem(failure);
      if (!failure) props.done();
    } catch (error) {
      setProblem(errorMessage(error));
    }
  }
  return (
    <section aria-label={props.title} className="space-y-3">
      <h4 className="font-semibold">{props.title}</h4>
      {props.children}
      {problem ? <p role="alert">{problem}</p> : null}
      {command.unresolved && !command.isPending ? (
        <Button variant="secondary" onClick={() => command.retryOriginal()}>
          Retry previous save
        </Button>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void send()}>
          {props.save}
        </Button>
        <Button variant="secondary" disabled={command.isPending} onClick={props.done}>
          Cancel
        </Button>
      </div>
    </section>
  );
}
function TextField(props: {
  label: string;
  value: string;
  max: number;
  set: (v: string) => void;
  hint?: string;
}) {
  return (
    <label className="field-label">
      {props.label}
      <input
        className="field-input"
        value={props.value}
        maxLength={props.max}
        {...(props.hint ? { placeholder: props.hint } : {})}
        onChange={(event) => props.set(event.target.value)}
      />
    </label>
  );
}
export function AddBuilding({ data, done }: FormProps) {
  const [name, setName] = useState('');
  return (
    <SetupForm
      title="Add building"
      data={data}
      save="Save building"
      done={done}
      submit={async () => {
        if (!name.trim()) return 'Enter the building name.';
        await data.command.mutateAsync({
          kind: 'building',
          name: name.trim(),
          sortOrder: data.buildingList.length,
        });
        return undefined;
      }}
    >
      <TextField
        label="Building name"
        hint="For example Block A"
        value={name}
        max={120}
        set={setName}
      />
    </SetupForm>
  );
}
export function AddFloor({ data, done, buildingId }: FormProps & { buildingId: string }) {
  const [label, setLabel] = useState(''),
    [level, setLevel] = useState('');
  const building = data.buildingList.find((row) => row.id === buildingId);
  return (
    <SetupForm
      title={'Add floor' + (building ? ' to ' + building.name : '')}
      data={data}
      save="Save floor"
      blocked={!building}
      done={done}
      submit={async () => {
        if (!label.trim()) return 'Enter the floor name.';
        if (!/^\d{1,3}$/.test(level)) return 'Enter the level as a number.';
        await data.command.mutateAsync({
          kind: 'floor',
          buildingId,
          label: label.trim(),
          levelNumber: Number(level),
        });
        return undefined;
      }}
    >
      <TextField
        label="Floor name"
        hint="For example Ground floor"
        value={label}
        max={120}
        set={setLabel}
      />
      <TextField
        label="Level number"
        hint="0 for ground, 1 for first"
        value={level}
        max={3}
        set={setLevel}
      />
    </SetupForm>
  );
}
// CHG-057: a room is just its number + photo; beds added later decide its real size.
export function AddRoom({ data, done, floorId }: FormProps & { floorId: string }) {
  const [label, setLabel] = useState(''),
    [photo, setPhoto] = useState<string>(),
    [uploading, setUploading] = useState(false);
  return (
    <SetupForm
      title="Add room"
      data={data}
      save="Save room"
      blocked={uploading}
      done={done}
      submit={async () => {
        if (!label.trim()) return 'Enter the room number.';
        if (!photo) return 'Add a room photo first.';
        const room = inventoryMutationSchema.parse(
          await data.command.mutateAsync({
            kind: 'setup_room',
            input: { label: label.trim(), floorId },
          }),
        );
        await data.command.mutateAsync({
          kind: 'photo',
          fileId: photo,
          altText: 'Room ' + label.trim(),
          roomId: room.id,
        });
        return undefined;
      }}
    >
      <TextField label="Room number" value={label} max={80} set={setLabel} />
      <PrivateFileInput
        id={'room-photo-' + floorId}
        label="Room photo"
        purpose="listing_photo"
        onReady={setPhoto}
        onBusy={setUploading}
      />
    </SetupForm>
  );
}
// CHG-056 / CHG-058: each bed carries its own rent and security; the photo is required so
// the bed is ready to list once saved.
export function AddBed({ data, done, roomId }: FormProps & { roomId: string }) {
  const [label, setLabel] = useState(''),
    [rent, setRent] = useState(''),
    [deposit, setDeposit] = useState('0'),
    [photo, setPhoto] = useState<string>(),
    [uploading, setUploading] = useState(false);
  const room = data.rooms.find((row) => row.id === roomId);
  return (
    <SetupForm
      title={'Add bed' + (room ? ' to room ' + room.label : '')}
      data={data}
      save="Save bed"
      blocked={uploading || !room}
      done={done}
      submit={async () => {
        if (!label.trim()) return 'Enter the bed name or number.';
        if (!photo || !room) return 'Add a bed photo first.';
        let monthlyRentPaisa: number, depositPaisa: number;
        try {
          monthlyRentPaisa = billingFormPaisa(rent);
          depositPaisa = billingFormPaisa(deposit);
        } catch {
          return 'Enter rent and security in rupees; use 0 for no security.';
        }
        const input = seatInputSchema.parse({
          label: label.trim(),
          status: 'active',
          monthlyRentPaisa,
          depositPaisa,
        });
        const bed = inventoryMutationSchema.parse(
          await data.command.mutateAsync({ kind: 'bed', roomId, input }),
        );
        await data.command.mutateAsync({
          kind: 'photo',
          fileId: photo,
          altText: 'Bed ' + label.trim() + ', room ' + room.label,
          roomId,
          bedId: bed.id,
        });
        return undefined;
      }}
    >
      <TextField label="Bed name" value={label} max={80} set={setLabel} />
      <label className="field-label">
        Monthly rent (Rs)
        <GroupedNumberInput
          className="field-input"
          value={rent}
          maxLength={12}
          onValueChange={setRent}
        />
      </label>
      <label className="field-label">
        Security deposit (Rs)
        <GroupedNumberInput
          className="field-input"
          value={deposit}
          maxLength={12}
          onValueChange={setDeposit}
        />
      </label>
      <PrivateFileInput
        id={'bed-photo-' + roomId}
        label="Bed photo"
        purpose="listing_photo"
        onReady={setPhoto}
        onBusy={setUploading}
      />
    </SetupForm>
  );
}
