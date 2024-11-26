import { Skeleton } from './loading/skeleton';
import { useEffect, useState, type ComponentType } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import type { MapPin } from '@hsm/api-client';
import { Copy } from './ui';
import { LocateFixed, Map as MapIcon, MapPinned, Pencil, RotateCw } from 'lucide-react-native';
import { mobileColors as colors, mobileSurfaces } from '@hsm/ui';
import { IconChip } from './inventory-tools';
import { usePinAddress } from '../lib/pin-address';
export interface BranchMapProps {
  pin: MapPin | undefined;
  pick: (pin: MapPin) => void;
  confirmLabel?: string;
  close: () => void;
}
export function LocationPicker({
  value,
  change,
  disabled,
  locate,
  locating = false,
  place,
  changeArea,
}: {
  value?: MapPin | undefined;
  change: (pin: MapPin) => void;
  disabled: boolean;
  locate?: (() => Promise<void>) | undefined;
  locating?: boolean;
  place?: string | undefined;
  changeArea?: (() => void) | undefined;
}) {
  const address = usePinAddress(value);
  const [open, setOpen] = useState(false),
    [pin, setPin] = useState<MapPin>();
  return (
    <View className="gap-3">
      {/* Status card: locate badge, state title, place line, refresh to detect again. */}
      <View
        style={mobileSurfaces.icyCard}
        className="flex-row items-center gap-3 rounded-card border border-cardBorder p-3 frosted-card"
      >
        <View className="h-12 w-12 items-center justify-center rounded-pill bg-aqua">
          <LocateFixed size={24} color={colors.primary} />
        </View>
        <View className="flex-1 gap-1">
          <Text className="font-heading text-body text-heading">
            {locating ? 'Finding your location…' : value ? 'Location set' : 'No location yet'}
          </Text>
          <Text className="font-body text-sm text-secondary" numberOfLines={2}>
            {address ??
              (value ? 'Location set · check on map' : (place ?? 'Use your location or the map'))}
          </Text>
        </View>
        {locate ? (
          <IconChip
            Icon={RotateCw}
            label={locating ? 'Detecting location…' : 'Use my current location'}
            disabled={disabled || locating}
            onPress={() => {
              void locate();
            }}
          />
        ) : null}
      </View>
      {place && changeArea ? (
        <View className="flex-row items-center gap-2">
          <MapPinned size={18} color={colors.secondary} />
          <Text className="flex-1 font-body text-sm text-text">Area: {place}</Text>
          <IconChip Icon={Pencil} text="Change" label="Change area" onPress={changeArea} />
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Choose on map"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => {
          setPin(value);
          setOpen(true);
        }}
        style={{ opacity: disabled ? 0.5 : 1 }}
      >
        <View
          style={mobileSurfaces.icyCard}
          className="min-h-14 flex-row items-center justify-center gap-2 rounded-card border border-cardBorder frosted-card"
        >
          <MapIcon size={22} color={colors.primary} />
          <Text className="font-heading text-body text-primary">Choose location on map</Text>
        </View>
      </Pressable>
      <Text className="font-body text-xs text-secondary">Map by OpenFreeMap</Text>
      {/* Full-screen map; Android Back closes it without changing the pin. */}
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        {open ? (
          <MapLoader
            pin={pin}
            pick={(next) => {
              if (!disabled) change(next);
            }}
            close={() => setOpen(false)}
          />
        ) : null}
      </Modal>
    </View>
  );
}
function MapLoader(props: BranchMapProps) {
  const [Canvas, setCanvas] = useState<ComponentType<BranchMapProps>>(),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void import('./branch-map')
      .then((module) => {
        if (active) setCanvas(() => module.BranchMap);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);
  if (failed)
    return (
      <Copy alert>Map unavailable. Close and reopen the map, or use your current location.</Copy>
    );
  return Canvas ? <Canvas {...props} /> : <Skeleton kind="list" label="Loading map…" />;
}
