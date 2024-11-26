import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ArrowLeft, ChevronRight, X, type LucideIcon } from 'lucide-react-native';
import { mobileOwnerColors as c, ownerMetrics as m } from '@hsm/ui';

// Native Modal frames use explicit sizing: the action sheet must not shrink to its text.
export function PropertyActionDialog(props: {
  visible: boolean;
  title: string;
  busy: boolean;
  close: () => void;
  back?: (() => void) | undefined;
  children: ReactNode;
}) {
  return (
    <Modal visible={props.visible} transparent animationType="fade" onRequestClose={props.close}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.backdrop}
      >
        <View
          accessibilityViewIsModal
          accessibilityLabel="Property actions dialog"
          style={styles.card}
        >
          <View pointerEvents="none" style={styles.corner} />
          <View style={styles.header}>
            {props.back ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to actions"
                disabled={props.busy}
                onPress={props.back}
                style={styles.close}
              >
                <ArrowLeft size={22} color={c.primary} />
              </Pressable>
            ) : null}
            <Text style={styles.title}>{props.title}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              accessibilityState={{ disabled: props.busy }}
              disabled={props.busy}
              onPress={props.close}
              style={styles.close}
            >
              <X size={22} color={c.secondary} />
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{ flexGrow: 0, flexShrink: 1 }}
            contentContainerStyle={styles.content}
          >
            {props.children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
export function PropertyActionRow(props: {
  label: string;
  Icon: LucideIcon;
  disabled: boolean;
  onPress: () => void;
  danger?: boolean;
  primary?: boolean;
}) {
  const color = props.primary ? c.onPrimary : props.danger ? c.danger : c.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: props.disabled }}
      disabled={props.disabled}
      onPress={props.onPress}
      android_ripple={{ color: c.primary + '18' }}
      style={[
        styles.action,
        {
          backgroundColor: props.primary
            ? c.primary + 'E8'
            : props.danger
              ? c.dangerSoft + 'A0'
              : c.surface + '80',
          opacity: props.disabled ? 0.45 : 1,
          justifyContent: props.primary ? 'center' : 'flex-start',
        },
      ]}
    >
      <props.Icon size={22} color={color} />
      <Text
        style={[
          styles.actionText,
          { color, flex: props.primary ? 0 : 1, textAlign: props.primary ? 'center' : 'left' },
        ]}
      >
        {props.label}
      </Text>
      {!props.primary ? <ChevronRight size={20} color={color} /> : null}
    </Pressable>
  );
}
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: m.page,
    backgroundColor: c.heading + '66',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    borderRadius: m.cardRadius,
    backgroundColor: c.background + 'F2',
    borderWidth: 1.2,
    borderColor: c.surface,
    overflow: 'hidden',
  },
  corner: {
    position: 'absolute',
    right: -50,
    top: -60,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: c.primary + '10',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: m.smallGap,
    paddingHorizontal: m.gap,
    paddingTop: m.smallGap,
    paddingBottom: m.smallGap,
  },
  title: { flex: 1, color: c.heading, fontSize: 20, fontFamily: 'PlusJakartaSans_700Bold' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: m.gap, paddingBottom: m.gap, gap: 12 },
  action: {
    width: '100%',
    minHeight: m.touch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: m.inputRadius,
    borderWidth: 1,
    borderColor: c.surface + 'D9',
  },
  actionText: { flex: 1, fontSize: 16, fontFamily: 'PlusJakartaSans_700Bold' },
});
