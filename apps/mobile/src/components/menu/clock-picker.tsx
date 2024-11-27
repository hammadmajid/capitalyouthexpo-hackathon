import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, Text, View } from 'react-native';
import { mobileColors as c, mobileSurfaces } from '@hsm/ui';
// CHG-037: premium clock for meal times. Tap an hour (the hand sweeps there), then the
// minutes, then AM/PM. Returns 24-hour "HH:MM".
const size = 252,
  radius = 98,
  center = size / 2;
const hours = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
function split(value: string | undefined) {
  const match = /^(\d{2}):(\d{2})$/.exec(value ?? '');
  const hour24 = match ? Number(match[1]) : 8;
  const minute = match ? Number(match[2]) : 0;
  return { hour: hour24 % 12 || 12, minute, pm: hour24 >= 12 };
}
export function joinClock(hour: number, minute: number, pm: boolean) {
  const hour24 = (hour % 12) + (pm ? 12 : 0);
  return String(hour24).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
}
export function ClockPicker(props: {
  visible: boolean;
  title: string;
  value: string | undefined;
  onClose: () => void;
  onPick: (value: string) => void;
}) {
  const start = split(props.value);
  const [hour, setHour] = useState(start.hour);
  const [minute, setMinute] = useState(start.minute);
  const [pm, setPm] = useState(start.pm);
  const [mode, setMode] = useState<'hour' | 'minute'>('hour');
  const sheet = useRef(new Animated.Value(0)).current;
  const hand = useRef(new Animated.Value((start.hour % 12) * 30)).current;
  useEffect(() => {
    if (!props.visible) return;
    const next = split(props.value);
    setHour(next.hour);
    setMinute(next.minute);
    setPm(next.pm);
    setMode('hour');
    hand.setValue((next.hour % 12) * 30);
    sheet.setValue(0);
    Animated.spring(sheet, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
  }, [props.visible, props.value, hand, sheet]);
  const sweep = (degrees: number) =>
    Animated.timing(hand, {
      toValue: degrees,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  const values = mode === 'hour' ? hours : minutes;
  const chosen = mode === 'hour' ? hour : minute;
  const label = (value: number) =>
    mode === 'hour' ? String(value) : String(value).padStart(2, '0');
  return (
    <Modal visible={props.visible} transparent animationType="fade" onRequestClose={props.onClose}>
      <Pressable
        accessibilityLabel="Close clock"
        onPress={props.onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,40,30,0.35)', justifyContent: 'flex-end' }}
      >
        <Animated.View
          onStartShouldSetResponder={() => true}
          style={{
            ...mobileSurfaces.icyCard,
            borderWidth: 1,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            padding: 20,
            gap: 16,
            alignItems: 'center',
            transform: [
              { translateY: sheet.interpolate({ inputRange: [0, 1], outputRange: [400, 0] }) },
            ],
          }}
        >
          <Text style={{ color: c.secondary, fontSize: 14 }}>{props.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {(['hour', 'minute'] as const).map((part, index) => (
              <View key={part} style={{ flexDirection: 'row', alignItems: 'center' }}>
                {index ? <Text style={{ fontSize: 44, color: c.heading }}>:</Text> : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={part === 'hour' ? 'Choose hour' : 'Choose minutes'}
                  onPress={() => {
                    setMode(part);
                    sweep(part === 'hour' ? (hour % 12) * 30 : (minute / 5) * 30);
                  }}
                  style={{
                    paddingHorizontal: 10,
                    borderRadius: 14,
                    backgroundColor: mode === part ? c.aqua : 'transparent',
                  }}
                >
                  <Text style={{ fontSize: 44, fontWeight: '700', color: c.deep }}>
                    {part === 'hour'
                      ? String(hour).padStart(2, '0')
                      : String(minute).padStart(2, '0')}
                  </Text>
                </Pressable>
              </View>
            ))}
            <View style={{ marginLeft: 10, gap: 6 }}>
              {[false, true].map((afternoon) => (
                <Pressable
                  key={String(afternoon)}
                  accessibilityRole="button"
                  accessibilityLabel={afternoon ? 'PM' : 'AM'}
                  accessibilityState={{ selected: pm === afternoon }}
                  onPress={() => setPm(afternoon)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: mobileSurfaces.icyCard.borderColor,
                    backgroundColor: pm === afternoon ? c.deep : c.surface,
                  }}
                >
                  <Text
                    style={{ color: pm === afternoon ? c.surface : c.primary, fontWeight: '700' }}
                  >
                    {afternoon ? 'PM' : 'AM'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: c.aqua,
            }}
          >
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: center - 1.5,
                top: center - radius,
                width: 3,
                height: radius,
                backgroundColor: c.primary,
                transform: [
                  { translateY: radius / 2 },
                  {
                    rotate: hand.interpolate({
                      inputRange: [0, 360],
                      outputRange: ['0deg', '360deg'],
                    }),
                  },
                  { translateY: -radius / 2 },
                ],
              }}
            />
            <View
              style={{
                position: 'absolute',
                left: center - 6,
                top: center - 6,
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: c.primary,
              }}
            />
            {values.map((value, index) => {
              const angle = (index * 30 * Math.PI) / 180;
              const on = value === chosen;
              return (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityLabel={label(value)}
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    sweep(index * 30);
                    if (mode === 'hour') {
                      setHour(value);
                      setTimeout(() => {
                        setMode('minute');
                        sweep((minute / 5) * 30);
                      }, 280);
                    } else setMinute(value);
                  }}
                  style={{
                    position: 'absolute',
                    left: center + radius * Math.sin(angle) - 20,
                    top: center - radius * Math.cos(angle) - 20,
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: on ? c.primary : 'transparent',
                  }}
                >
                  <Text style={{ color: on ? c.surface : c.heading, fontWeight: '700' }}>
                    {label(value)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', gap: 12, alignSelf: 'stretch' }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel time"
              onPress={props.onClose}
              style={{
                flex: 1,
                minHeight: 52,
                borderRadius: 26,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: mobileSurfaces.icyCard.borderColor,
                backgroundColor: c.surface,
              }}
            >
              <Text style={{ color: c.primary, fontWeight: '700' }}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Set time"
              onPress={() => {
                props.onPick(joinClock(hour, minute, pm));
                props.onClose();
              }}
              style={{
                flex: 1,
                minHeight: 52,
                borderRadius: 26,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: c.deep,
              }}
            >
              <Text style={{ color: c.surface, fontWeight: '700' }}>Set time</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
