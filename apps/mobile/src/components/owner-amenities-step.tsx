import { OwnerCustomAmenities } from './owner-custom-amenities';
import { OwnerMenuCard } from './menu/owner-menu-card';
import { TransportSetup } from './transport/transport-setup';
import { Skeleton } from './loading/skeleton';
import { useState } from 'react';
import { View } from 'react-native';
import { ListChecks } from 'lucide-react-native';
import { mobileColors as colors } from '@hsm/ui';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { listApprovedAmenities, saveListingSettings } from '@hsm/api-client';
import type { PrivateListing } from '@hsm/contracts';
import { actorClient } from '../lib/runtime';
import { withFreshSession } from '../lib/fresh-session';
import { safeMessage } from '../lib/messages';
import { useNativeCommand } from './services/use-command';
import { ChoiceTile, SetupButton, SetupCard, SetupHeading, SetupText } from './owner-wizard-ui';
// LIST-00x: amenities come from the platform-approved catalog and save on the branch listing
// with an If-Match version, so a concurrent edit is reported instead of silently overwritten.
export function OwnerAmenitiesStep({
  actorId,
  branchId,
  listing,
  next,
}: {
  actorId: string;
  branchId: string;
  listing: UseQueryResult<PrivateListing>;
  next: () => void;
}) {
  const catalog = useQuery({
    queryKey: ['owner-amenity-catalog', actorId],
    retry: false,
    queryFn: () =>
      withFreshSession(
        async () => (await listApprovedAmenities(await actorClient(actorId), { limit: 100 })).data,
      ),
  });
  const saved = listing.data?.amenities.map((row) => row.code);
  const [selection, setSelection] = useState<string[]>();
  const [menuUnsaved, setMenuUnsaved] = useState(false);
  const [routeOpen, setRouteOpen] = useState(false);
  const chosen = selection ?? saved ?? [];
  const command = useNativeCommand<{ version: string; codes: string[] }>(
    'owner-amenities:' + branchId,
    actorId,
    (client, body, key) => {
      const current = listing.data;
      if (!current) throw new Error('Listing not loaded');
      return saveListingSettings(
        client,
        branchId,
        body.version,
        {
          description: current.description,
          nearbyLandmark: current.nearbyLandmark,
          publicPhone: current.publicPhone,
          publicEmail: current.publicEmail,
          showPublicContact: current.showPublicContact,
          amenityCodes: body.codes,
        },
        key,
      );
    },
    [['owner-listing', actorId, branchId]],
  );
  const busy = command.isPending || command.unresolved;
  const canEdit = listing.data?.canEdit ?? false;
  const changed =
    selection !== undefined && [...selection].sort().join() !== [...(saved ?? [])].sort().join();
  const failure = catalog.error ?? listing.error ?? command.error;
  const retired = (listing.data?.amenities ?? []).filter((row) => !row.isActive);
  return (
    <>
      <SetupCard>
        <View className="flex-row items-center gap-2">
          <ListChecks color={colors.primary} size={21} />
          <SetupHeading>Hostel amenities</SetupHeading>
        </View>
        {catalog.isPending || listing.isPending ? (
          <Skeleton kind="inline" label="Loading amenities…" />
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(catalog.data ?? []).map((amenity) => (
            <ChoiceTile
              key={amenity.code}
              equalColumns
              label={amenity.name}
              selected={chosen.includes(amenity.code)}
              disabled={busy || !canEdit}
              onPress={() =>
                setSelection(
                  chosen.includes(amenity.code)
                    ? chosen.filter((code) => code !== amenity.code)
                    : [...chosen, amenity.code],
                )
              }
            />
          ))}
        </View>
        <OwnerCustomAmenities
          actorId={actorId}
          branchId={branchId}
          selected={chosen}
          change={busy || !canEdit ? undefined : setSelection}
        />
        {retired.length ? (
          <SetupText muted>Retired by HSM: {retired.map((row) => row.name).join(', ')}</SetupText>
        ) : null}
        {listing.data && !canEdit ? <SetupText muted>View only</SetupText> : null}
      </SetupCard>
      {/* One card each: amenities, food menu, transport. */}
      <SetupCard>
        <OwnerMenuCard actorId={actorId} branchId={branchId} onUnsavedChange={setMenuUnsaved} />
      </SetupCard>
      <SetupCard>
        <TransportSetup actorId={actorId} branchId={branchId} onOpenChange={setRouteOpen} />
      </SetupCard>
      {command.unresolved && !command.isPending ? (
        <SetupButton label="Retry previous amenity save" onPress={() => command.retryOriginal()} />
      ) : null}
      {failure ? <SetupText alert>{safeMessage(failure)}</SetupText> : null}
      <SetupButton
        label={
          menuUnsaved
            ? 'Save the menu first'
            : routeOpen
              ? 'Save the route first'
              : busy
                ? 'Saving…'
                : changed
                  ? 'Save amenities & continue'
                  : 'Continue'
        }
        disabled={busy || !listing.data || menuUnsaved || routeOpen}
        onPress={() => {
          if (!changed || !listing.data) return next();
          command.mutate(
            { version: listing.data.version, codes: chosen },
            {
              onSuccess: () => {
                setSelection(undefined);
                next();
              },
            },
          );
        }}
      />
    </>
  );
}
