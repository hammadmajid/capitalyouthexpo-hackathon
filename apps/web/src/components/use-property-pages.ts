'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { readPropertyBuildings, readPropertyFloors } from '@hsm/api-client';
import { browserClient } from '../lib/client';
export function usePropertyPages(actorId: string, branchId: string) {
  const [cursor, setCursor] = useState<string>();
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [buildingId, setBuildingId] = useState('');
  const [floorId, setFloorId] = useState('');
  const [floorPosition, setFloorPosition] = useState<{ buildingId: string; cursor: string }>();
  const buildings = useQuery({
    queryKey: ['property-pages', actorId, branchId, 'buildings', cursor, search],
    gcTime: 0,
    retry: false,
    queryFn: () =>
      readPropertyBuildings(browserClient(), branchId, {
        limit: 20,
        view: 'all',
        ...(cursor ? { cursor } : {}),
        ...(search ? { search } : {}),
      }),
  });
  const building = !buildings.isError
    ? buildings.data?.data.find((row) => row.id === buildingId)
    : undefined;
  const floorCursor =
    floorPosition?.buildingId === building?.id ? floorPosition?.cursor : undefined;
  const floors = useQuery({
    queryKey: ['property-pages', actorId, branchId, 'floors', building?.id, floorCursor],
    enabled: Boolean(building),
    gcTime: 0,
    retry: false,
    queryFn: () => {
      if (!building) throw new Error('Choose a building');
      return readPropertyFloors(browserClient(), branchId, building.id, {
        limit: 20,
        view: 'all',
        ...(floorCursor ? { cursor: floorCursor } : {}),
      });
    },
  });
  const floor = !floors.isError ? floors.data?.data.find((row) => row.id === floorId) : undefined;
  const ready =
    Boolean(buildings.data) &&
    !buildings.isError &&
    !buildings.isFetching &&
    (!building || (Boolean(floors.data) && !floors.isError && !floors.isFetching));
  return {
    buildings,
    floors,
    building,
    floor,
    ready,
    draft,
    setDraft,
    canEdit:
      ready && Boolean(buildings.data?.canEdit) && (!building || Boolean(floors.data?.canEdit)),
    selectBuilding: (id: string) => {
      setBuildingId(id);
      setFloorId('');
      setFloorPosition(undefined);
    },
    selectFloor: setFloorId,
    search: () => {
      setSearch(draft.trim());
      setCursor(undefined);
      setBuildingId('');
      setFloorId('');
      setFloorPosition(undefined);
    },
    firstBuildings: () => {
      setCursor(undefined);
      setBuildingId('');
      setFloorId('');
    },
    nextBuildings: () => {
      if (buildings.data?.nextCursor) {
        setCursor(buildings.data.nextCursor);
        setBuildingId('');
        setFloorId('');
      }
    },
    firstFloors: () => {
      setFloorPosition(undefined);
      setFloorId('');
    },
    nextFloors: () => {
      if (building && floors.data?.nextCursor) {
        setFloorPosition({ buildingId: building.id, cursor: floors.data.nextCursor });
        setFloorId('');
      }
    },
    hasPreviousBuildings: Boolean(cursor),
    hasPreviousFloors: Boolean(floorCursor),
  };
}
export type PropertyPages = ReturnType<typeof usePropertyPages>;
