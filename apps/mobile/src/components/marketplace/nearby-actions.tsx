import { useEffect, useState, type ComponentType } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { LocateFixed, Map as MapIcon } from 'lucide-react-native';
import type { MapPin } from '@hsm/api-client';
import { mobileColors as colors, mobileSurfaces, marketplaceMetrics as metrics } from '@hsm/ui';
import { detectOwnerLocation } from '../../lib/owner-location';
import type { BranchMapProps } from '../location-picker';
import { Skeleton } from '../loading/skeleton';
// CHG-034: any spot works, even a place missing from the directory.
export function NearbyActions(props: { choose: (pin: MapPin, label: string) => void }) {
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState<string>();
  const [open, setOpen] = useState(false);
  async function nearMe() {
    setMessage(undefined);
    setLocating(true);
    const result = await detectOwnerLocation();
    setLocating(false);
    if (result.status === 'ready') return props.choose(result.pin, 'Near me');
    setMessage(
      result.status === 'denied'
        ? 'Allow location access to use Near me.'
        : 'Location is off. Turn it on, or pick on map.',
    );
  }
  return (
    <View style={{ gap: metrics.sm, marginHorizontal: metrics.lg }}>
      <View style={{ flexDirection: 'row', gap: metrics.sm }}>
        <Chip
          Icon={LocateFixed}
          text={locating ? 'Finding you…' : 'Near me'}
          disabled={locating}
          onPress={() => void nearMe()}
        />
        <Chip Icon={MapIcon} text="Pick on map" onPress={() => setOpen(true)} />
      </View>
      {message ? (
        <Text accessibilityRole="alert" style={{ color: colors.dangerText, fontSize: 13 }}>
          {message}
        </Text>
      ) : null}
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        {open ? (
          <MapLoader
            pin={undefined}
            confirmLabel="Show hostels here"
            pick={(pin) => props.choose(pin, 'Pinned spot')}
            close={() => setOpen(false)}
          />
        ) : null}
      </Modal>
    </View>
  );
}
function Chip(props: {
  Icon: typeof LocateFixed;
  text: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.text}
      accessibilityState={{ disabled: Boolean(props.disabled) }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={{
        ...mobileSurfaces.icyCard,
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: metrics.sm,
        minHeight: metrics.touch,
        borderRadius: metrics.pill,
        borderWidth: 1,
        opacity: props.disabled ? 0.6 : 1,
      }}
    >
      <props.Icon color={colors.primary} size={20} />
      <Text style={{ color: colors.primary, fontWeight: '700' }}>{props.text}</Text>
    </Pressable>
  );
}
export function MapLoader(props: BranchMapProps) {
  const [Canvas, setCanvas] = useState<ComponentType<BranchMapProps>>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void import('../branch-map')
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
      <Pressable accessibilityRole="button" onPress={props.close} style={{ padding: metrics.lg }}>
        <Text style={{ color: colors.dangerText }}>Map unavailable. Tap to close.</Text>
      </Pressable>
    );
  return Canvas ? <Canvas {...props} /> : <Skeleton kind="list" label="Loading map…" />;
}
