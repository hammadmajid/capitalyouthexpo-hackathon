'use client';
import { useState } from 'react';
import { MarketplaceButton as Button } from './ui/marketplace-button';
import {
  useMarketplaceMap,
  type MarketplaceBounds,
  type MarketplaceMapListing,
} from './use-marketplace-map';
export function MarketplaceMap({
  listings,
  onSearch,
  disabled,
}: {
  listings: MarketplaceMapListing[];
  onSearch: (bounds: MarketplaceBounds) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-label="Hostel map" className="space-y-3">
      <p>View the loaded approved hostels on a map. Opening the map contacts OpenFreeMap.</p>
      <Button variant="secondary" onClick={() => setOpen((value) => !value)}>
        {open ? 'Close hostel map' : 'Show hostel map'}
      </Button>
      {open ? <MapView listings={listings} onSearch={onSearch} disabled={disabled} /> : null}
    </section>
  );
}
function MapView({
  listings,
  onSearch,
  disabled,
}: {
  listings: MarketplaceMapListing[];
  onSearch: (bounds: MarketplaceBounds) => void;
  disabled: boolean;
}) {
  const { container, ready, failed, bounds } = useMarketplaceMap(listings);
  return (
    <div className="space-y-3">
      <div
        ref={container}
        role="region"
        aria-label="Approved hostel locations"
        className="h-80 w-full rounded-input border border-hsm-border"
      />
      {failed ? (
        <p role="alert">Map unavailable. Hostel cards and search remain available below.</p>
      ) : (
        <p role="status">
          {ready ? 'Showing loaded approved hostels only.' : 'Loading hostel map…'}
        </p>
      )}
      <Button
        disabled={disabled || !ready || failed || !bounds}
        onClick={() => {
          if (bounds) onSearch(bounds);
        }}
      >
        Search this map area
      </Button>
      <p>
        Map results follow the same filters as the hostel cards. Load more results to show more
        markers.
      </p>
      <p className="text-sm">
        <a href="https://openfreemap.org/" target="_blank" rel="noreferrer">
          OpenFreeMap
        </a>{' '}
        ·{' '}
        <a href="https://openmaptiles.org/" target="_blank" rel="noreferrer">
          OpenMapTiles
        </a>{' '}
        ·{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          © OpenStreetMap contributors
        </a>
      </p>
    </div>
  );
}
