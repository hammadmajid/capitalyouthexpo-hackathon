import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react-native';
import { TextInput, View } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { readCustomAmenities, saveCustomAmenity } from '@hsm/api-client';
import { mobileColors as colors } from '@hsm/ui';
import { customAmenityInputSchema, type CustomAmenityCommand } from '@hsm/contracts';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { useNativeCommand } from './services/use-command';
import { ChoiceTile, FieldLabel, SetupButton, SetupText } from './owner-wizard-ui';
import { NavIconButton } from './navigation/header';
import { Skeleton } from './loading/skeleton';
export function OwnerCustomAmenities(props: {
  actorId: string;
  branchId: string;
  selected: string[];
  change?: ((codes: string[]) => void) | undefined;
}) {
  const [form, setForm] = useState(false),
    [name, setName] = useState(''),
    [category, setCategory] = useState<
      'connectivity' | 'facilities' | 'security' | 'services' | 'other'
    >('other'),
    [editing, setEditing] = useState<{ code: string; version: string }>();
  const key = ['owner-custom-amenities', props.actorId, props.branchId];
  const catalog = useInfiniteQuery({
    queryKey: key,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      readCustomAmenities(await actorClient(props.actorId), props.branchId, {
        limit: 30,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const command = useNativeCommand<CustomAmenityCommand>(
    'custom-amenities:' + props.branchId,
    props.actorId,
    (client, body, commandKey) => saveCustomAmenity(client, props.branchId, body, commandKey),
    [
      ['owner-custom-amenities', props.actorId],
      ['owner-listing', props.actorId],
      ['owner-room-amenities', props.actorId],
      ['public-listing'],
    ],
  );
  const busy = command.isPending || command.unresolved;
  const editable = catalog.data?.pages[0]?.canEdit ?? false;
  const rows = catalog.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <View className="gap-2">
      {editable || rows.length ? (
        <View className="flex-row items-center justify-between gap-2">
          <FieldLabel>Custom amenities</FieldLabel>
          {editable && !form ? (
            <NavIconButton
              label="Add custom amenity"
              disabled={busy}
              onPress={() => {
                setEditing(undefined);
                setName('');
                setCategory('other');
                setForm(true);
              }}
            >
              <Plus size={19} color={colors.primary} />
            </NavIconButton>
          ) : null}
        </View>
      ) : null}
      {catalog.isPending ? <Skeleton kind="inline" label="Loading custom amenities" /> : null}
      {rows
        .filter((row) => row.isActive || props.selected.includes(row.code))
        .map((row) => (
          <View key={row.code} className="flex-row items-center gap-2">
            <ChoiceTile
              label={row.name + (row.isActive ? '' : ' · Archived')}
              selected={props.selected.includes(row.code)}
              disabled={
                !props.change || busy || (!row.isActive && !props.selected.includes(row.code))
              }
              onPress={() =>
                props.change?.(
                  props.selected.includes(row.code)
                    ? props.selected.filter((code) => code !== row.code)
                    : [...props.selected, row.code],
                )
              }
            />
            {editable && row.isActive ? (
              <NavIconButton
                label={'Edit ' + row.name}
                disabled={busy}
                onPress={() => {
                  setEditing({ code: row.code, version: row.version });
                  setName(row.name);
                  setCategory(row.category);
                  setForm(true);
                }}
              >
                <Pencil size={18} color={colors.primary} />
              </NavIconButton>
            ) : null}
          </View>
        ))}
      {catalog.hasNextPage ? (
        <SetupButton
          secondary
          label="More custom amenities"
          disabled={catalog.isFetchingNextPage}
          onPress={() => void catalog.fetchNextPage()}
        />
      ) : null}
      {form ? (
        <>
          <FieldLabel>Amenity name</FieldLabel>
          <TextInput
            accessibilityLabel="Custom amenity name"
            value={name}
            onChangeText={setName}
            maxLength={80}
            placeholder="e.g. Laundry room"
            placeholderTextColor={colors.secondary}
            editable={!busy}
            className="min-h-12 rounded-input border border-border bg-inputSurface px-4 font-body text-body text-text"
          />
          <FieldLabel>Category</FieldLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {customAmenityInputSchema.shape.category.options.map((value) => (
              <ChoiceTile
                key={value}
                label={value.charAt(0).toUpperCase() + value.slice(1)}
                selected={category === value}
                disabled={busy}
                onPress={() => setCategory(value)}
              />
            ))}
          </View>
          <SetupButton
            label="Save amenity"
            disabled={busy || !customAmenityInputSchema.safeParse({ name, category }).success}
            onPress={() =>
              command.mutate(
                editing
                  ? { kind: 'edit', ...editing, name, category }
                  : { kind: 'create', name, category },
                { onSuccess: () => setForm(false) },
              )
            }
          />
          {editing ? (
            <SetupButton
              secondary
              label="Archive amenity"
              disabled={busy}
              onPress={() =>
                command.mutate(
                  {
                    kind: 'archive',
                    ...editing,
                    reason: 'Owner removed amenity from available offerings',
                  },
                  { onSuccess: () => setForm(false) },
                )
              }
            />
          ) : null}
          <SetupButton secondary label="Cancel" disabled={busy} onPress={() => setForm(false)} />
        </>
      ) : null}
      {(catalog.error ?? command.error) ? (
        <SetupText alert>{safeMessage(catalog.error ?? command.error)}</SetupText>
      ) : null}
      {command.unresolved && !command.isPending ? (
        <SetupButton label="Retry amenity change" onPress={() => command.retryOriginal()} />
      ) : null}
    </View>
  );
}
