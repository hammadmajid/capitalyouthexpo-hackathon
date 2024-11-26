import { FilterChip } from './inventory-tools';
import { useToolOpen } from './inventory-tools';
import { AppHeader } from './navigation/header';
import { Skeleton } from './loading/skeleton';
import { useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { bedOccupancyStateSchema, type BedOccupancyState } from '@hsm/contracts';
import { readBranchOccupancy } from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { Copy } from './ui';
import { MarketplaceAction as Button } from './marketplace/action';
import { DateField } from './date-field';
import { NativeBedDetail } from './bed-detail';
// Status is spelled out in text, never shown by colour alone.
const labels: Record<BedOccupancyState, string> = {
  occupied: 'Occupied',
  blocked: 'Blocked',
  reserved: 'Reserved',
  unavailable: 'Unavailable',
  available: 'Available',
};
// BED-001 / RES-004: read-only Bed Board from authoritative server occupancy. The parent
// mounts it only for a live stay_manage grant; the server enforces the grant on every read.
export function NativeBedBoard({ actorId, branchId }: { actorId: string; branchId: string }) {
  const [open, setOpen] = useToolOpen(),
    [draft, setDraft] = useState(''),
    [on, setOn] = useState(''),
    [cursor, setCursor] = useState<string>(),
    [state, setState] = useState<BedOccupancyState>(),
    [bed, setBed] = useState<string>();
  const query = useQuery({
    queryKey: ['bed-board', actorId, branchId, on, state, cursor],
    enabled: open,
    gcTime: 0,
    retry: false,
    queryFn: async () =>
      readBranchOccupancy(await actorClient(actorId), branchId, {
        limit: 20,
        ...(on ? { on } : {}),
        ...(cursor ? { cursor } : {}),
        ...(state ? { state } : {}),
      }),
  });
  if (!open) return <Button secondary label="View Bed Board" onPress={() => setOpen(true)} />;
  const page = query.data;
  return (
    <View className="gap-2" accessibilityLabel="Bed Board">
      <AppHeader
        title="Occupancy by date"
        backLabel="Close occupancy by date"
        onBack={() => setOpen(false)}
      />
      <DateField
        label="Occupancy date"
        value={draft}
        onChange={setDraft}
        optional
        placeholder="Today"
      />
      <Button
        secondary
        label="Show occupancy for date"
        disabled={query.isFetching}
        onPress={() => {
          setOn(draft.trim());
          setCursor(undefined);
        }}
      />
      <View className="flex-row flex-wrap gap-2">
        {bedOccupancyStateSchema.options.map((value) => (
          <FilterChip
            key={value}
            text={labels[value]}
            label={'Only ' + labels[value].toLowerCase() + ' beds'}
            selected={state === value}
            onPress={() => {
              setState(state === value ? undefined : value);
              setCursor(undefined);
            }}
          />
        ))}
      </View>
      {query.isPending ? <Skeleton kind="table" label="Loading occupancy…" /> : null}
      {query.isError ? <Copy alert>{safeMessage(query.error)}</Copy> : null}
      {page ? (
        <View className="gap-2">
          <Copy>
            {page.on}: {page.totals.beds} beds · {page.totals.occupied} occupied ·{' '}
            {page.totals.reserved} reserved · {page.totals.blocked} blocked ·{' '}
            {page.totals.unavailable} unavailable · {page.totals.available} available
          </Copy>
          {page.data.map((room) => (
            <View key={room.id} className="gap-1">
              <Copy>
                Room {room.label}
                {room.status === 'active' ? '' : ' (' + room.status + ')'}
              </Copy>
              {room.beds.map((item) => (
                <Button
                  key={item.id}
                  secondary
                  label={
                    'Bed ' +
                    item.label +
                    ': ' +
                    labels[item.state] +
                    (item.occupant ? ' — ' + item.occupant.displayName : '')
                  }
                  onPress={() => setBed(item.id)}
                />
              ))}
            </View>
          ))}
          {cursor ? (
            <Button secondary label="First rooms" onPress={() => setCursor(undefined)} />
          ) : null}
          {page.nextCursor ? (
            <Button
              secondary
              label="Next rooms"
              onPress={() => setCursor(page.nextCursor ?? undefined)}
            />
          ) : null}
        </View>
      ) : null}
      {bed ? (
        <NativeBedDetail
          actorId={actorId}
          branchId={branchId}
          bedId={bed}
          on={on}
          close={() => setBed(undefined)}
        />
      ) : null}
    </View>
  );
}
