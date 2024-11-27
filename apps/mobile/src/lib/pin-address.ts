import { useEffect, useState } from 'react';
import type { MapPin } from '@hsm/api-client';
// HSM-LOC: a readable address for the current pin, from the device's own geocoder (Android may
// ask Google). Display only: the saved branch keeps the owner's typed address and coordinates.
export function usePinAddress(pin: MapPin | undefined) {
  return usePinPlace(pin).address;
}
export function usePinPlace(pin: MapPin | undefined) {
  const [address, setAddress] = useState<string>(),
    [parts, setParts] = useState<string[]>([]);
  const latitude = pin?.latitude,
    longitude = pin?.longitude;
  useEffect(() => {
    let active = true;
    setAddress(undefined);
    setParts([]);
    if (latitude === undefined || longitude === undefined) return;
    void (async () => {
      try {
        const location = await import('expo-location');
        const [place] = await location.reverseGeocodeAsync({ latitude, longitude });
        if (!active || !place) return;
        const all = [
          place.name,
          place.street,
          place.district,
          place.subregion,
          place.city,
          place.region,
        ]
          .filter((part): part is string => Boolean(part && part.trim()))
          .filter((part, index, all) => all.indexOf(part) === index);
        setParts(all);
        setAddress(all.slice(0, 4).join(', ') || undefined);
      } catch {
        // Geocoder unavailable: the card falls back to "Location set".
      }
    })();
    return () => {
      active = false;
    };
  }, [latitude, longitude]);
  return { address, parts };
}
