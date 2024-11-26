import { useState } from 'react';
import { router } from 'expo-router';
import { billingFormPaisa } from '@hsm/api-client';
import { inventoryMutationSchema, seatInputSchema } from '@hsm/contracts';
import { safeMessage } from '../lib/messages';
import { FlowForm } from './flow-form';
import { OwnerPhotoField } from './owner-photo-field';
import type { FloorRooms } from './use-floor-rooms';
import { FieldLabel, SetupButton, SetupCard, SetupHeading, SetupText } from './owner-wizard-ui';
// Add screens: one form each; a successful server save returns to the previous screen.
const done = () => (router.canGoBack() ? router.back() : undefined);
function Failure({ data }: { data: FloorRooms }) {
  return (
    <>
      {data.command.unresolved && !data.command.isPending ? (
        <SetupButton label="Retry previous save" onPress={() => data.command.retryOriginal()} />
      ) : null}
      {data.command.error ? <SetupText alert>{safeMessage(data.command.error)}</SetupText> : null}
    </>
  );
}
export function AddBuildingScreen({ data }: { data: FloorRooms }) {
  const busy = data.command.isPending || data.command.unresolved;
  return (
    <SetupCard>
      <SetupHeading>Add Building</SetupHeading>
      <FlowForm
        Action={SetupButton}
        Label={FieldLabel}
        disabled={busy}
        label="Save building"
        fields={[
          { name: 'name', label: 'Building name *', hint: 'For example Block A', maxLength: 120 },
        ]}
        submit={async (values) => {
          const name = (values.name ?? '').trim();
          if (!name) return 'Enter the building name.';
          await data.command.mutateAsync({
            kind: 'building',
            name,
            sortOrder: data.buildingList.length,
          });
          done();
          return 'Saved.';
        }}
      />
      <Failure data={data} />
    </SetupCard>
  );
}
export function AddFloorScreen({ data, buildingId }: { data: FloorRooms; buildingId: string }) {
  const busy = data.command.isPending || data.command.unresolved;
  const building = data.buildingList.find((row) => row.id === buildingId);
  return (
    <SetupCard>
      <SetupHeading>Add Floor{building ? ' to ' + building.name : ''}</SetupHeading>
      <FlowForm
        Action={SetupButton}
        Label={FieldLabel}
        disabled={busy || !building}
        label="Save floor"
        fields={[
          {
            name: 'label',
            label: 'Floor name *',
            hint: 'For example Ground floor',
            maxLength: 120,
          },
          {
            name: 'levelNumber',
            label: 'Level number *',
            hint: '0 for ground, 1 for first',
            keyboard: 'number-pad',
            maxLength: 3,
          },
        ]}
        submit={async (values) => {
          const label = (values.label ?? '').trim();
          if (!label) return 'Enter the floor name.';
          if (!/^\d{1,3}$/.test(values.levelNumber ?? '')) return 'Enter the level as a number.';
          await data.command.mutateAsync({
            kind: 'floor',
            buildingId,
            label,
            levelNumber: Number(values.levelNumber),
          });
          done();
          return 'Saved.';
        }}
      />
      <Failure data={data} />
    </SetupCard>
  );
}
export function AddRoomScreen({
  actorId,
  data,
  floorId,
}: {
  actorId: string;
  data: FloorRooms;
  floorId: string;
}) {
  const [photo, setPhoto] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const busy = data.command.isPending || data.command.unresolved;
  return (
    <SetupCard>
      <SetupHeading>Add Room</SetupHeading>
      <FlowForm
        Action={SetupButton}
        Label={FieldLabel}
        disabled={busy || uploading}
        label="Save room"
        fields={[{ name: 'label', label: 'Room number *', maxLength: 80 }]}
        extra={(_values, _set, formBusy) => (
          <OwnerPhotoField
            compact
            actorId={actorId}
            label="Room photo *"
            fileId={photo}
            change={setPhoto}
            busy={setUploading}
            disabled={formBusy}
          />
        )}
        submit={async (values) => {
          const label = (values.label ?? '').trim();
          if (!label) return 'Enter the room number.';
          if (!photo) return 'Add a room photo first.';
          const room = inventoryMutationSchema.parse(
            await data.command.mutateAsync({
              kind: 'setup_room',
              input: { label, floorId },
            }),
          );
          await data.command.mutateAsync({
            kind: 'photo',
            fileId: photo,
            altText: 'Room ' + label,
            roomId: room.id,
          });
          done();
          return 'Saved.';
        }}
      />
      <Failure data={data} />
    </SetupCard>
  );
}
export function AddBedScreen({
  actorId,
  data,
  roomId,
}: {
  actorId: string;
  data: FloorRooms;
  roomId: string;
}) {
  const [photo, setPhoto] = useState<string>(),
    [uploading, setUploading] = useState(false);
  const busy = data.command.isPending || data.command.unresolved;
  const room = data.rooms.find((row) => row.id === roomId);
  return (
    <SetupCard>
      <SetupHeading>Add Bed{room ? ' to room ' + room.label : ''}</SetupHeading>
      <FlowForm
        Action={SetupButton}
        Label={FieldLabel}
        disabled={busy || uploading || !room}
        label="Save bed"
        initialValues={{ deposit: '0' }}
        fields={[
          { name: 'label', label: 'Bed name *', maxLength: 80 },
          {
            name: 'rent',
            label: 'Monthly rent (Rs) *',
            keyboard: 'number-pad',
            maxLength: 12,
          },
          {
            name: 'deposit',
            label: 'Security deposit (Rs) *',
            keyboard: 'number-pad',
            maxLength: 12,
          },
        ]}
        extra={(_values, _set, formBusy) => (
          <OwnerPhotoField
            actorId={actorId}
            compact
            label="Bed photo *"
            fileId={photo}
            change={setPhoto}
            busy={setUploading}
            disabled={formBusy}
          />
        )}
        submit={async (values) => {
          const label = (values.label ?? '').trim();
          if (!label) return 'Enter the bed name or number.';
          if (!photo || !room) return 'Add a bed photo first.';
          let monthlyRentPaisa: number, depositPaisa: number;
          try {
            monthlyRentPaisa = billingFormPaisa(values.rent ?? '');
            depositPaisa = billingFormPaisa(values.deposit ?? '');
          } catch {
            throw new Error('Enter rent and security in rupees; use 0 for no security.');
          }
          const bed = inventoryMutationSchema.parse(
            await data.command.mutateAsync({
              kind: 'bed',
              roomId,
              // The bed photo is required here, so the bed is ready to use once saved.
              input: seatInputSchema.parse({
                label,
                status: 'active',
                monthlyRentPaisa,
                depositPaisa,
              }),
            }),
          );
          await data.command.mutateAsync({
            kind: 'photo',
            fileId: photo,
            altText: 'Bed ' + label + ', room ' + room.label,
            roomId,
            bedId: bed.id,
          });
          done();
          return 'Saved.';
        }}
      />
      <Failure data={data} />
    </SetupCard>
  );
}
