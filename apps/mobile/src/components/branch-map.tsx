import { useRef, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { Camera, Map, type CameraRef } from '@maplibre/maplibre-react-native';
import { ArrowLeft, MapPin as PinIcon } from 'lucide-react-native';
import { branchMapCenter, branchMapStyle, readMapPin, type MapPin } from '@hsm/api-client';
import { mobileColors as colors, mobileSurfaces } from '@hsm/ui';
import { usePinAddress } from '../lib/pin-address';
import type { BranchMapProps } from './location-picker';
import { Button, Copy } from './ui';
// HSM-LOC: full-screen map. The pointer stays in the middle; moving the map (or tapping a
// spot) chooses the place under it, and Save keeps it as the draft pin.
export function BranchMap({ pin, pick, close, confirmLabel }: BranchMapProps) {
  const initial = useRef(pin),
    camera = useRef<CameraRef>(null),
    [candidate, setCandidate] = useState<MapPin | undefined>(pin),
    [failed, setFailed] = useState(false),
    [ready, setReady] = useState(false);
  const address = usePinAddress(candidate);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Map
        testID="branch-location-map"
        style={{ flex: 1 }}
        mapStyle={branchMapStyle}
        onDidFinishLoadingMap={() => setReady(true)}
        onDidFailLoadingMap={() => setFailed(true)}
        onRegionDidChange={(event) => {
          const point = readMapPin(...event.nativeEvent.center);
          if (point) setCandidate(point);
        }}
        onPress={(event) => {
          const point = readMapPin(...event.nativeEvent.lngLat);
          if (!point) return;
          setCandidate(point);
          camera.current?.easeTo({ center: [point.longitude, point.latitude], duration: 300 });
        }}
      >
        <Camera
          ref={camera}
          initialViewState={{
            center: initial.current
              ? [initial.current.longitude, initial.current.latitude]
              : branchMapCenter,
            zoom: initial.current ? 16 : 12,
          }}
        />
      </Map>
      {/* Fixed pointer: its tip marks the map centre. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View style={{ marginBottom: 44 }} accessibilityLabel="Selected branch pin">
          <PinIcon size={44} color={colors.primary} fill={colors.surface} />
        </View>
      </View>
      <View style={{ position: 'absolute', top: 48, left: 16 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close map"
          onPress={close}
          style={mobileSurfaces.icyCard}
          className="h-12 w-12 items-center justify-center rounded-pill border border-border"
        >
          <ArrowLeft size={22} color={colors.primary} />
        </Pressable>
      </View>
      <View
        style={[mobileSurfaces.icyCard, { position: 'absolute', left: 12, right: 12, bottom: 20 }]}
        className="gap-3 rounded-card border border-cardBorder p-4 frosted-card"
      >
        <Text className="font-heading text-body text-heading" numberOfLines={2}>
          {failed
            ? 'Map unavailable'
            : !ready
              ? 'Loading map…'
              : (address ?? (candidate ? 'Selected place' : 'Move the map to the hostel'))}
        </Text>
        {failed ? (
          <Copy alert>
            Map unavailable. Close and reopen the map, or use your current location.
          </Copy>
        ) : null}
        <Button
          label={confirmLabel ?? 'Save location'}
          disabled={!candidate || failed}
          onPress={() => {
            if (!candidate) return;
            pick(candidate);
            close();
          }}
        />
        <Text
          accessibilityRole="link"
          onPress={() => {
            void Linking.openURL('https://www.openstreetmap.org/copyright').catch(() =>
              setFailed(true),
            );
          }}
          className="font-body text-xs text-secondary"
        >
          OpenFreeMap · OpenMapTiles · © OpenStreetMap contributors
        </Text>
      </View>
    </View>
  );
}
