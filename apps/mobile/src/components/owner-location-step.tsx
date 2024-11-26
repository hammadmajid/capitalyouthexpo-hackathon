import { House, LocateFixed, MapPinned, type LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';
import { mobileColors } from '@hsm/ui';
import { useCallback, useEffect, useState } from 'react';
import { ownerMainForm, type MapPin } from '@hsm/api-client';
import type { HostelOnboarding, MainBranchDraftInput } from '@hsm/contracts';
import { FlowForm } from './flow-form';
import { OwnerAreaPicker, useAreaMatch, useAreaNames } from './owner-area-picker';
import { usePinPlace } from '../lib/pin-address';
import { LocationPicker } from './location-picker';
import type { OwnerLocationControl } from './use-owner-location';
import { FieldLabel, SetupButton, SetupCard, SetupHeading, SetupText } from './owner-wizard-ui';
const locationCopy: Record<string, string> = {
  detecting: 'Finding your location…',
  denied: 'Location off · pick on the map',
  unavailable: 'Location unavailable · pick on the map',
};
// Section heading with an icon badge (keeps the header role for screen readers).
function IconHeading({ Icon, title }: { Icon: LucideIcon; title: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: mobileColors.aqua,
        }}
      >
        <Icon size={20} color={mobileColors.primary} />
      </View>
      <SetupHeading>{title}</SetupHeading>
    </View>
  );
}
// HSM-LOC (SRS v2.13): foreground-only detection fills an empty pin; a saved or manually
// chosen pin is never overwritten automatically. Coordinates stay internal (no numeric UI).
export function OwnerLocationStep({
  actorId,
  data,
  location,
  draft,
  disabled,
  save,
  change,
}: {
  actorId: string;
  data: HostelOnboarding;
  location?: OwnerLocationControl | undefined;
  draft?: Record<string, string> | undefined;
  disabled: boolean;
  save: (input: MainBranchDraftInput) => Promise<void>;
  change: (values: Record<string, string>) => void;
}) {
  const branch = data.mainBranch;
  const [geography, setGeography] = useState({
    cityId: branch?.cityId ?? null,
    areaId: branch?.areaId ?? null,
    subAreaId: branch?.subAreaId ?? null,
  });
  const [pin, setPin] = useState<MapPin | undefined>(branch?.location ?? undefined),
    [error, setError] = useState('');
  const automatic = location?.state.status === 'ready' ? location.state.pin : undefined;
  const pick = useCallback((value: MapPin) => setPin(value), []);
  const place = useAreaNames(actorId, geography);
  const detected = usePinPlace(pin);
  const match = useAreaMatch(actorId, detected.parts);
  const [manualArea, setManualArea] = useState(false);
  // The owner asked to detect again (refresh), so show progress even with a pin set.
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    if (automatic) setPin((current) => current ?? automatic);
  }, [automatic]);
  // The area follows the pin unless the owner chose one by hand.
  useEffect(() => {
    if (match && !manualArea)
      setGeography((current) =>
        current.areaId === match.areaId ? current : { ...match, subAreaId: null },
      );
  }, [match?.areaId, match?.cityId, manualArea]);
  const showArea = manualArea || !match || !geography.areaId;
  return (
    <>
      {showArea ? (
        <SetupCard>
          <IconHeading Icon={MapPinned} title="Area" />
          <OwnerAreaPicker
            actorId={actorId}
            value={geography}
            change={(value) => {
              setManualArea(true);
              setGeography(value);
            }}
            disabled={disabled}
          />
        </SetupCard>
      ) : null}
      <SetupCard>
        <IconHeading Icon={LocateFixed} title="Location" />
        {/* Detection only fills an empty pin, so its status means nothing once one is set. */}
        {!pin && location && locationCopy[location.state.status] ? (
          <SetupText muted>{locationCopy[location.state.status]}</SetupText>
        ) : null}
        <LocationPicker
          place={place || undefined}
          value={pin}
          change={pick}
          disabled={disabled}
          locating={asking || (!pin && location?.state.status === 'detecting')}
          locate={
            location
              ? async () => {
                  setAsking(true);
                  try {
                    const detected = await location.detect();
                    if (detected) pick(detected);
                  } finally {
                    setAsking(false);
                  }
                }
              : undefined
          }
        />
      </SetupCard>
      <SetupCard>
        <IconHeading Icon={House} title="Full address" />
        <FlowForm
          Action={SetupButton}
          Label={FieldLabel}
          disabled={disabled}
          resetAfterSubmit={false}
          label="Save & Continue"
          onDraftChange={change}
          initialValues={
            draft ?? {
              branchName: branch?.name ?? 'Main branch',
              address: branch?.addressLine ?? '',
              landmark: branch?.nearbyLandmark ?? '',
              branchPhone: branch?.phone ?? '',
            }
          }
          fields={[
            {
              name: 'address',
              label: 'Address *',
              hint: 'Private until approval',
              multiline: true,
              maxLength: 500,
            },
            { name: 'landmark', label: 'Landmark (optional)', maxLength: 200 },
          ]}
          submit={async (values) => {
            setError('');
            if (!geography.cityId || !geography.areaId)
              return setError('Choose the city and the sector or area.');
            if ((values.address ?? '').trim().length < 5)
              return setError('Enter the complete hostel address (at least five characters).');
            if (!pin) return setError('Confirm the hostel location on the map.');
            await save(
              ownerMainForm(
                {
                  ...values,
                  branchName: values.branchName || branch?.name || 'Main branch',
                  branchCategory: branch?.category ?? '',
                  branchDescription: branch?.description ?? '',
                  latitude: pin.latitude.toString(),
                  longitude: pin.longitude.toString(),
                },
                geography,
              ),
            );
          }}
        />
        {error ? <SetupText alert>{error}</SetupText> : null}
      </SetupCard>
    </>
  );
}
