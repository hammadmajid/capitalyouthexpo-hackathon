import { useEffect, useState } from 'react';
import { Keyboard, Pressable, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Building2 } from 'lucide-react-native';
import { placeKinds } from '../place-kinds';
import { marketplaceInstitutions } from '@hsm/api-client';
import type { institutionPageSchema, MarketplaceQuery } from '@hsm/contracts';
import type { z } from 'zod';
import { mobileColors as colors, mobileSurfaces, marketplaceMetrics as metrics } from '@hsm/ui';
import { client } from '../../lib/runtime';
export type Place = z.infer<typeof institutionPageSchema>['data'][number];
// CHG-033: typing any place or area (G-10, PIMS, a company) offers it as a search point.
export function usePlaceSuggestions(text: string) {
  const [term, setTerm] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setTerm(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text]);
  return useQuery({
    queryKey: ['place-suggestions', term],
    enabled: term.length >= 2,
    staleTime: 60_000,
    queryFn: () => marketplaceInstitutions(client, { q: term, limit: 6, radiusMeters: 5000 }),
  });
}
export function PlaceSuggestions(props: { places: Place[]; pick: (place: Place) => void }) {
  if (!props.places.length) return null;
  return (
    <View
      accessibilityLabel="Places"
      style={{
        ...mobileSurfaces.icyCard,
        borderWidth: 1,
        borderRadius: metrics.card,
        marginHorizontal: metrics.lg,
        overflow: 'hidden',
      }}
    >
      {props.places.map((place, index) => {
        const { label, Icon } = placeKinds[place.type] ?? { label: 'Place', Icon: Building2 };
        return (
          <Pressable
            key={place.id}
            accessibilityRole="button"
            accessibilityLabel={`Hostels near ${place.name}, ${label}`}
            onPress={() => props.pick(place)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: metrics.md,
              minHeight: metrics.touch,
              paddingHorizontal: metrics.lg,
              borderTopWidth: index ? 1 : 0,
              borderTopColor: colors.border,
            }}
          >
            <Icon color={colors.primary} size={20} />
            <Text numberOfLines={1} style={{ flex: 1, color: colors.heading, fontWeight: '600' }}>
              {place.name}
            </Text>
            <Text style={{ color: colors.secondary, fontSize: 12 }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
type SetQuery = (update: (current: Partial<MarketplaceQuery>) => Partial<MarketplaceQuery>) => void;
// Picking a place shows hostels within 10 km, nearest first. Submitting picks the best match,
// or falls back to a plain text search when no place matches.
export function usePlaceSearch(setQuery: SetQuery) {
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState(false);
  const suggestions = usePlaceSuggestions(picked ? '' : search);
  const places = picked ? [] : (suggestions.data?.data ?? []);
  function pick(place: Place) {
    Keyboard.dismiss();
    setPicked(true);
    setSearch(place.name);
    setQuery(() => ({
      universityPlaceId: place.id,
      radiusMeters: 10_000,
      sort: 'nearest',
      limit: 20,
    }));
  }
  // CHG-034: a phone location or map pin searches around that exact spot.
  function point(pin: { latitude: number; longitude: number }, label: string) {
    Keyboard.dismiss();
    setPicked(true);
    setSearch(label);
    setQuery(() => ({
      nearLatitude: pin.latitude,
      nearLongitude: pin.longitude,
      radiusMeters: 10_000,
      sort: 'nearest',
      limit: 20,
    }));
  }
  return {
    search,
    places,
    pick,
    point,
    clear: () => {
      setPicked(false);
      setSearch('');
    },
    onChange: (value: string) => {
      setPicked(false);
      setSearch(value);
    },
    onSubmit: () => {
      const [best] = places;
      if (best) return pick(best);
      Keyboard.dismiss();
      setQuery((current) => ({ ...current, q: search.trim(), cursor: undefined }));
    },
  };
}
