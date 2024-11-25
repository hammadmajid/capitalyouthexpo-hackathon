'use client';
import { listOwnerCities, listOwnerAreas, type ApiClient } from '@hsm/api-client';
import { OwnerChoice } from './owner-choice';
import { Button } from './ui/button';
export interface OwnerGeographyValue {
  cityId: string | null;
  areaId: string | null;
  subAreaId: string | null;
}
export function OwnerGeography({
  userId,
  client,
  value,
  change,
}: {
  userId: string;
  client: ApiClient;
  value: OwnerGeographyValue;
  change: (value: OwnerGeographyValue) => void;
}) {
  return (
    <section className="space-y-4" aria-label="Branch geography">
      <p>
        {value.cityId ? 'A city is selected. Choose below to replace it.' : 'Choose a city.'}{' '}
        {value.areaId ? 'An area is selected.' : ''}{' '}
        {value.subAreaId ? 'A sub-area is selected.' : ''}
      </p>
      <OwnerChoice
        label="Cities"
        selectedId={value.cityId}
        queryKey={['owner-cities', userId]}
        load={(cursor) => listOwnerCities(client, { limit: 20, ...(cursor ? { cursor } : {}) })}
        choose={(item) => change({ cityId: item.id, areaId: null, subAreaId: null })}
      />
      {value.cityId ? (
        <OwnerChoice
          key={value.cityId}
          label="Areas"
          selectedId={value.areaId}
          queryKey={['owner-areas', userId, value.cityId]}
          load={(cursor) =>
            listOwnerAreas(client, value.cityId ?? '', { limit: 20, ...(cursor ? { cursor } : {}) })
          }
          choose={(item) => change({ ...value, areaId: item.id, subAreaId: null })}
        />
      ) : null}
      {value.cityId && value.areaId ? (
        <OwnerChoice
          key={value.areaId}
          label="Sub-areas (optional)"
          selectedId={value.subAreaId}
          queryKey={['owner-sub-areas', userId, value.cityId, value.areaId]}
          load={(cursor) =>
            listOwnerAreas(client, value.cityId ?? '', {
              limit: 20,
              parentId: value.areaId ?? '',
              ...(cursor ? { cursor } : {}),
            })
          }
          choose={(item) => change({ ...value, subAreaId: item.id })}
        />
      ) : null}
      {value.subAreaId ? (
        <Button variant="secondary" onClick={() => change({ ...value, subAreaId: null })}>
          Clear optional sub-area
        </Button>
      ) : null}
    </section>
  );
}
