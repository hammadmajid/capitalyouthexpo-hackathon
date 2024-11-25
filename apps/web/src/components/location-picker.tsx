'use client';
import { loadMapLibre } from '../lib/maplibre';
import { useEffect, useRef, useState } from 'react';
import {
  branchMapCenter,
  branchMapStyle,
  mapPinFromFields,
  readMapPin,
  type MapPin,
} from '@hsm/api-client';
import { Button } from './ui/button';
import type { Map as MapInstance } from 'maplibre-gl';
export interface LocationPickerProps {
  values: Record<string, string>;
  change: (pin: MapPin) => void;
  disabled: boolean;
}
export function LocationPicker({ values, change, disabled }: LocationPickerProps) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState<MapPin>();
  return (
    <div className="space-y-3">
      <p>
        Choose a branch pin or enter coordinates. Opening the map contacts OpenFreeMap; device
        location is never requested.
      </p>
      <Button
        type="button"
        variant="secondary"
        disabled={disabled}
        onClick={() => {
          setPin(mapPinFromFields(values));
          setOpen(true);
        }}
      >
        Choose on map
      </Button>
      {open && (
        <>
          <BranchMap initialPin={pin} onPick={setPin} />
          <p role="status">
            {pin
              ? `Selected: ${pin.latitude}, ${pin.longitude}`
              : 'Tap the map to choose a branch location.'}
          </p>
          <Button
            type="button"
            disabled={disabled || !pin}
            onClick={() => {
              if (pin) change(pin);
              setOpen(false);
            }}
          >
            Use selected pin
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={disabled}
            onClick={() => setOpen(false)}
          >
            Cancel map
          </Button>
        </>
      )}
    </div>
  );
}
function BranchMap({
  initialPin,
  onPick,
}: {
  initialPin: MapPin | undefined;
  onPick: (pin: MapPin) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  // The map owns its initial viewport. Selection updates must not recreate its worker.
  const initial = useRef(initialPin),
    pick = useRef(onPick);
  pick.current = onPick;
  useEffect(() => {
    let disposed = false,
      map: MapInstance | undefined;
    void loadMapLibre()
      .then(({ Map, Marker, NavigationControl }) => {
        if (disposed || !container.current) return;
        const point = initial.current;
        map = new Map({
          container: container.current,
          style: branchMapStyle,
          center: point ? [point.longitude, point.latitude] : branchMapCenter,
          zoom: point ? 15 : 11,
          attributionControl: { compact: false },
        });
        const marker = new Marker();
        if (point) marker.setLngLat([point.longitude, point.latitude]).addTo(map);
        map.addControl(new NavigationControl());
        map.on('click', (event) => {
          const selected = readMapPin(event.lngLat.lng, event.lngLat.lat);
          if (!selected || !map) return;
          marker.setLngLat([selected.longitude, selected.latitude]).addTo(map);
          pick.current(selected);
        });
        map.on('load', () => {
          if (!disposed) setReady(true);
        });
        map.on('error', () => {
          if (!disposed) setFailed(true);
        });
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      map?.remove();
    };
  }, []);
  return (
    <>
      <div
        ref={container}
        role="region"
        aria-label="Branch location map"
        className="h-80 w-full rounded-input border border-hsm-border"
      />
      {!failed && <p role="status">{ready ? 'Map ready.' : 'Loading map…'}</p>}
      {failed && (
        <p role="alert">Map unavailable. You can cancel and enter coordinates manually.</p>
      )}
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
    </>
  );
}
