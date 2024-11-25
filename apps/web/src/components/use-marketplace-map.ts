import { useEffect, useRef, useState } from 'react';
import { loadMapLibre } from '../lib/maplibre';
import type { z } from 'zod';
import { marketplaceQuerySchema, type listingSummarySchema } from '@hsm/contracts';
import { branchMapCenter, branchMapStyle, marketplacePrice } from '@hsm/api-client';
import { marketplaceColors as colors, spacing, radii } from '@hsm/ui';
import type { Map as MapInstance, Marker as MapMarker } from 'maplibre-gl';
export type MarketplaceMapListing = z.infer<typeof listingSummarySchema>;
export type MarketplaceBounds = { west: number; east: number; south: number; north: number };
function viewport(current: MapInstance): MarketplaceBounds | undefined {
  const value = current.getBounds(),
    candidate = {
      west: value.getWest(),
      east: value.getEast(),
      south: value.getSouth(),
      north: value.getNorth(),
    };
  return marketplaceQuerySchema.safeParse(candidate).success ? candidate : undefined;
}
function createMap(
  runtime: typeof import('maplibre-gl'),
  container: HTMLDivElement,
  ready: () => void,
  failed: () => void,
  moved: (value: MarketplaceBounds | undefined) => void,
) {
  const current = new runtime.Map({
    container,
    style: branchMapStyle,
    center: branchMapCenter,
    zoom: 11,
    attributionControl: { compact: false },
  });
  current.addControl(new runtime.NavigationControl());
  current.on('load', () => {
    ready();
    moved(viewport(current));
  });
  current.on('moveend', () => moved(viewport(current)));
  current.on('error', failed);
  return current;
}
function markerElement(listing: MarketplaceMapListing) {
  const link = document.createElement('a');
  link.href = '/hostels/' + listing.branchId;
  link.textContent =
    listing.priceFromPaisa === null
      ? listing.name
      : listing.name + ' · ' + marketplacePrice(listing.priceFromPaisa);
  link.setAttribute('aria-label', 'View ' + listing.name);
  Object.assign(link.style, {
    backgroundColor: colors.surface,
    color: colors.primary,
    border: '1px solid ' + colors.border,
    padding: spacing.sm + 'px',
    minHeight: spacing.touch + 'px',
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: radii.sm + 'px',
  });
  return link;
}
export function useMarketplaceMap(listings: MarketplaceMapListing[]) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<MapInstance | undefined>(undefined),
    markerType = useRef<typeof import('maplibre-gl').Marker | undefined>(undefined),
    markers = useRef<MapMarker[]>([]);
  const [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false),
    [bounds, setBounds] = useState<MarketplaceBounds>();
  useEffect(() => {
    let disposed = false;
    void loadMapLibre()
      .then((runtime) => {
        if (disposed || !container.current) return;
        markerType.current = runtime.Marker;
        map.current = createMap(
          runtime,
          container.current,
          () => {
            if (!disposed) {
              setReady(true);
              setFailed(false);
            }
          },
          () => {
            if (!disposed) setFailed(true);
          },
          (value) => {
            if (!disposed) setBounds(value);
          },
        );
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      map.current?.remove();
      map.current = undefined;
    };
  }, []);
  useEffect(() => {
    const current = map.current,
      Marker = markerType.current;
    if (!ready || !current || !Marker) return;
    markers.current.forEach((marker) => marker.remove());
    markers.current = listings.map((listing) =>
      new Marker({ element: markerElement(listing) })
        .setLngLat([listing.longitude, listing.latitude])
        .addTo(current),
    );
  }, [ready, listings]);
  return { container, ready, failed, bounds };
}
