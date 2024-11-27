import { useState, useCallback, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ArrowLeftRight, DoorOpen, Receipt } from 'lucide-react-native';
import { mobileColors as c, mobileSurfaces } from '@hsm/ui';
import { AppHeader } from './navigation/header';
import { useOwnerScreenBack } from './owner-screen-back';
import { ResidentGlassCorners, residentStyles as s } from './resident-detail-ui';
import { PremiumSurface } from './visual-surfaces';
export function StayStaffSections(props: {
  agreement: ReactNode;
  accommodation?: ReactNode;
  summary?: ReactNode | ((onOpen: () => void) => ReactNode);
  header?: (onCheckout: () => void, onAgreement: () => void) => ReactNode;
  timeline?: ReactNode;
  money: ReactNode;
  lifecycle: ReactNode;
  transfer?: ReactNode;
  showLifecycle: boolean;
  onOpenChange?: (open: boolean) => void;
  childPanel?: boolean;
  onCollect?: (() => void) | undefined;
  collectLabel?: string | undefined;
  collectDisabled?: boolean;
}) {
  const [open, setOpenState] = useState<string>();
  const setOpen = useCallback(
    (key: string | undefined) => {
      setOpenState(key);
      props.onOpenChange?.(key !== undefined);
    },
    [props.onOpenChange],
  );
  const close = useCallback(() => setOpen(undefined), [setOpen]);
  const sections = [
    { key: 'agreement', title: 'Agreement', body: props.agreement },
    { key: 'money', title: 'Payment history', body: props.money },
    ...(props.showLifecycle
      ? [
          { key: 'transfer', title: 'Shift Bed', body: props.transfer },
          { key: 'lifecycle', title: 'Stay and checkout', body: props.lifecycle },
        ]
      : []),
  ];
  const current = sections.find((section) => section.key === open);
  useOwnerScreenBack(close, Boolean(current) && !props.childPanel, 3);
  if (current)
    return (
      <View style={{ gap: 10 }}>
        {props.childPanel ? null : (
          <AppHeader
            title={current.title}
            backLabel={'Back from ' + current.title.toLowerCase()}
            onBack={close}
          />
        )}
        {current.body}
      </View>
    );
  return (
    <View style={{ gap: 9 }}>
      {props.header?.(
        () => setOpen('lifecycle'),
        () => setOpen('agreement'),
      )}
      {props.accommodation}
      {props.timeline}
      {typeof props.summary === 'function' ? props.summary(() => setOpen('money')) : props.summary}
      <View
        accessibilityLabel="Resident actions"
        style={{ flexDirection: 'row', gap: 9, paddingTop: 5 }}
      >
        {props.showLifecycle && props.transfer ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Shift bed"
            onPress={() => setOpen('transfer')}
            style={[
              s.card,
              s.row,
              { flex: 1.1, minHeight: 44, padding: 8, justifyContent: 'center', gap: 7 },
            ]}
          >
            <ResidentGlassCorners />
            <ArrowLeftRight size={20} color={c.primary} />
            <Text style={[s.value, { fontSize: 12, color: c.primary }]}>Shift Bed</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={props.collectLabel ?? 'Collect rent'}
          disabled={props.collectDisabled}
          accessibilityState={{ disabled: Boolean(props.collectDisabled) }}
          onPress={props.onCollect ?? (() => setOpen('money'))}
          style={[
            mobileSurfaces.emeraldGlass,
            s.row,
            {
              flex: 1.6,
              minHeight: 48,
              borderRadius: 16,
              padding: 8,
              justifyContent: 'center',
              overflow: 'hidden',
            },
          ]}
        >
          <PremiumSurface dark />
          <Receipt size={22} color={c.surface} />
          <Text style={[s.value, { fontSize: 13, color: c.surface, flexShrink: 1 }]}>
            {props.collectLabel ?? 'Collect Rent'}
          </Text>
        </Pressable>
      </View>
      {!props.header ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Agreement"
          onPress={() => setOpen('agreement')}
          style={[s.row, { minHeight: 44 }]}
        >
          <Text style={s.body}>Agreement</Text>
        </Pressable>
      ) : null}
      {!props.header && props.showLifecycle ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Stay and checkout"
          onPress={() => setOpen('lifecycle')}
          style={[s.row, { minHeight: 44 }]}
        >
          <DoorOpen size={19} color={c.primary} />
          <Text style={s.body}>Stay and checkout</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
