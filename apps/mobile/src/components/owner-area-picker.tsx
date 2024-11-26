import { Skeleton } from './loading/skeleton';
import { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { listOwnerAreas, listOwnerCities } from '@hsm/api-client';
import { mobileOwnerColors as ownerColors } from '@hsm/ui';
import { actorClient } from '../lib/runtime';
import { withFreshSession } from '../lib/fresh-session';
import { safeMessage } from '../lib/messages';
import { ChoiceTile, SetupText } from './owner-wizard-ui';
export interface OwnerGeographyValue {
  cityId: string | null;
  areaId: string | null;
  subAreaId: string | null;
}
type Area = Awaited<ReturnType<typeof listOwnerAreas>>['data'][number];
const naturalName = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
// Catalog is small reference data; read every page once so search is complete and local.
async function allAreas(actorId: string, cityId: string, parentId?: string) {
  const client = await actorClient(actorId),
    rows: Area[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const result = await listOwnerAreas(client, cityId, {
      limit: 100,
      ...(cursor ? { cursor } : {}),
      ...(parentId ? { parentId } : {}),
    });
    rows.push(...result.data);
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }
  return rows.sort(
    (a, b) =>
      Number(a.level !== 'sector') - Number(b.level !== 'sector') ||
      naturalName.compare(a.name, b.name),
  );
}
export function OwnerAreaPicker({
  actorId,
  value,
  change,
  disabled = false,
}: {
  actorId: string;
  value: OwnerGeographyValue;
  change: (value: OwnerGeographyValue) => void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState('');
  const cities = useQuery({
    queryKey: ['owner-cities', actorId, 'all'],
    retry: false,
    queryFn: () =>
      withFreshSession(
        async () => (await listOwnerCities(await actorClient(actorId), { limit: 100 })).data,
      ),
  });
  const areas = useQuery({
    queryKey: ['owner-areas', actorId, value.cityId, 'all'],
    enabled: Boolean(value.cityId),
    retry: false,
    queryFn: () => withFreshSession(() => allAreas(actorId, value.cityId ?? '')),
  });
  const subAreas = useQuery({
    queryKey: ['owner-sub-areas', actorId, value.cityId, value.areaId, 'all'],
    enabled: Boolean(value.cityId && value.areaId),
    retry: false,
    queryFn: () =>
      withFreshSession(() => allAreas(actorId, value.cityId ?? '', value.areaId ?? '')),
  });
  const term = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      (areas.data ?? []).filter(
        (row) => row.id === value.areaId || !term || row.name.toLowerCase().includes(term),
      ),
    [areas.data, term, value.areaId],
  );
  const failure = cities.error ?? areas.error ?? subAreas.error;
  const chosen = (areas.data ?? []).find((row) => row.id === value.areaId);
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(cities.data ?? []).map((city) => (
          <ChoiceTile
            key={city.id}
            label={city.name}
            selected={value.cityId === city.id}
            disabled={disabled}
            compact
            onPress={() => {
              setSearch('');
              change({ cityId: city.id, areaId: null, subAreaId: null });
            }}
          />
        ))}
      </View>
      {value.cityId ? (
        <>
          {chosen && !term ? (
            <View style={{ alignSelf: 'flex-start' }}>
              <ChoiceTile
                label={chosen.name}
                selected
                compact
                disabled={false}
                onPress={() => undefined}
              />
            </View>
          ) : null}
          <TextInput
            accessibilityLabel="Search sectors and areas"
            testID="field-area-search"
            placeholder={chosen ? 'Change sector (e.g. G-11)' : 'Search sector (e.g. G-11)'}
            placeholderTextColor={ownerColors.secondary}
            value={search}
            onChangeText={setSearch}
            editable={!disabled}
            autoCorrect={false}
            className="min-h-12 rounded-input border border-border bg-inputSurface px-4 py-3 font-body text-body text-text"
          />
          {areas.isPending ? <Skeleton kind="inline" label="Loading sectors and areas…" /> : null}
          {/* Long lists only while searching, or before anything is chosen. */}
          {term || !chosen ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {visible.slice(0, 12).map((row) => (
                <ChoiceTile
                  key={row.id}
                  label={row.name}
                  selected={value.areaId === row.id}
                  disabled={disabled}
                  compact
                  onPress={() => {
                    setSearch('');
                    change({ ...value, areaId: row.id, subAreaId: null });
                  }}
                />
              ))}
            </View>
          ) : null}
          {areas.data && !visible.length ? <SetupText muted>No match</SetupText> : null}
        </>
      ) : null}
      {subAreas.data?.length ? (
        <>
          <SetupText muted>Sub-area (optional)</SetupText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {subAreas.data.map((row) => (
              <ChoiceTile
                key={row.id}
                label={row.name}
                selected={value.subAreaId === row.id}
                disabled={disabled}
                compact
                onPress={() =>
                  change({ ...value, subAreaId: value.subAreaId === row.id ? null : row.id })
                }
              />
            ))}
          </View>
        </>
      ) : null}
      {failure ? (
        <>
          <SetupText alert>{safeMessage(failure)}</SetupText>
        </>
      ) : null}
    </View>
  );
}
/** Read-only names for saved geography IDs (same cached catalog reads as the picker). */
export function useAreaNames(
  actorId: string,
  value: { cityId: string | null; areaId: string | null; subAreaId: string | null },
) {
  const cities = useQuery({
    queryKey: ['owner-cities', actorId, 'all'],
    retry: false,
    queryFn: () =>
      withFreshSession(
        async () => (await listOwnerCities(await actorClient(actorId), { limit: 100 })).data,
      ),
  });
  const areas = useQuery({
    queryKey: ['owner-areas', actorId, value.cityId, 'all'],
    enabled: Boolean(value.cityId),
    retry: false,
    queryFn: () => withFreshSession(() => allAreas(actorId, value.cityId ?? '')),
  });
  const subAreas = useQuery({
    queryKey: ['owner-sub-areas', actorId, value.cityId, value.areaId, 'all'],
    enabled: Boolean(value.cityId && value.areaId && value.subAreaId),
    retry: false,
    queryFn: () =>
      withFreshSession(() => allAreas(actorId, value.cityId ?? '', value.areaId ?? '')),
  });
  return [
    subAreas.data?.find((row) => row.id === value.subAreaId)?.name,
    areas.data?.find((row) => row.id === value.areaId)?.name,
    cities.data?.find((row) => row.id === value.cityId)?.name,
  ]
    .filter(Boolean)
    .join(', ');
}
// Letters and digits only, so "H13" and "H-13" compare equal.
const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
/** HSM-LOC: the catalog city and sector named in a detected address, if any. */
export function useAreaMatch(actorId: string, parts: string[]) {
  const cities = useQuery({
    queryKey: ['owner-cities', actorId, 'all'],
    retry: false,
    queryFn: () =>
      withFreshSession(
        async () => (await listOwnerCities(await actorClient(actorId), { limit: 100 })).data,
      ),
  });
  const words = parts.map(squash).filter(Boolean);
  const city = (cities.data ?? []).find((row) =>
    words.some((word) => word.includes(squash(row.name))),
  );
  const areas = useQuery({
    queryKey: ['owner-areas', actorId, city?.id ?? null, 'all'],
    enabled: Boolean(city),
    retry: false,
    queryFn: () => withFreshSession(() => allAreas(actorId, city?.id ?? '')),
  });
  // Longest name first so "G-11/2" wins over "G-11" and "E-11" never matches "E-1".
  const area = [...(areas.data ?? [])]
    .sort((a, b) => b.name.length - a.name.length)
    .find((row) => {
      const name = squash(row.name);
      return name.length > 1 && words.some((word) => word === name || word.startsWith(name + ' '));
    });
  return city && area ? { cityId: city.id, areaId: area.id } : undefined;
}
