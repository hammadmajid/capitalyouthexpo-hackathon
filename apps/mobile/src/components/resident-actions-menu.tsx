import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { DoorOpen, FileText, History, Pencil, X, type LucideIcon } from 'lucide-react-native';
import { mobileColors as c } from '@hsm/ui';
import { ResidentGlassCorners, residentStyles as s } from './resident-detail-ui';
export function ResidentActionsMenu(props: {
  top: number;
  onClose: () => void;
  onEdit?: (() => void) | undefined;
  onHistory?: (() => void) | undefined;
  onCheckout?: (() => void) | undefined;
  onAgreement?: (() => void) | undefined;
}) {
  const { height } = useWindowDimensions();
  const items: { label: string; Icon: LucideIcon; action?: (() => void) | undefined }[] = [
    { label: 'Edit resident', Icon: Pencil, action: props.onEdit },
    { label: 'Agreement', Icon: FileText, action: props.onAgreement },
    { label: 'Resident stay history', Icon: History, action: props.onHistory },
    { label: 'Stay and checkout', Icon: DoorOpen, action: props.onCheckout },
  ];
  return (
    <Modal
      transparent
      visible
      animationType="fade"
      statusBarTranslucent
      onRequestClose={props.onClose}
    >
      <View style={{ flex: 1 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close resident actions"
          style={StyleSheet.absoluteFill}
          onPress={props.onClose}
        />
        <View
          accessibilityViewIsModal
          accessibilityLabel="Resident actions menu"
          style={[
            s.card,
            {
              position: 'absolute',
              right: 18,
              top: Math.max(
                48,
                Math.min(
                  props.top,
                  height - (items.filter((item) => item.action).length + 1) * 44 - 32,
                ),
              ),
              width: 220,
              backgroundColor: c.inputSurface,
              padding: 8,
              gap: 0,
            },
          ]}
        >
          <ResidentGlassCorners />
          {items
            .filter((item) => item.action)
            .map(({ label, Icon, action }) => (
              <Pressable
                key={label}
                accessibilityRole="button"
                accessibilityLabel={label}
                onPress={() => {
                  props.onClose();
                  action?.();
                }}
                style={[s.row, { minHeight: 44, paddingHorizontal: 8 }]}
              >
                <Icon size={20} color={c.primary} />
                <Text style={[s.value, { fontSize: 12 }]}>
                  {label === 'Resident stay history' ? 'Previous stays' : label}
                </Text>
              </Pressable>
            ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss resident menu"
            onPress={props.onClose}
            style={[s.row, { minHeight: 44, paddingHorizontal: 8 }]}
          >
            <X size={20} color={c.primary} />
            <Text style={s.body}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
