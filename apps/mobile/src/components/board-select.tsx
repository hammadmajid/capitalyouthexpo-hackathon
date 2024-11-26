import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, Check, ChevronDown, LayoutGrid, type LucideIcon } from 'lucide-react-native';
import { mobileOwnerColors as c, mobileSurfaces, ownerMetrics as m } from '@hsm/ui';
// A dropdown pill (icon, current choice, chevron) that opens a centred card of big choices.
export function BoardSelect(props: {
  label: string;
  Icon: LucideIcon;
  allLabel: string;
  value: string | undefined;
  options: { id: string; name: string }[];
  onChange: (value: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = props.options.find((option) => option.id === props.value)?.name ?? props.allLabel;
  const choices = [{ id: undefined, name: props.allLabel }, ...props.options];
  return (
    <>
      <View style={{ flex: 1 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={props.label + ': ' + current}
          accessibilityHint="Opens the list of choices"
          onPress={() => setOpen(true)}
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
        >
          <View style={styles.pill}>
            <props.Icon size={22} color={c.primary} />
            <Text className="font-heading" numberOfLines={1} style={styles.value}>
              {current}
            </Text>
            <ChevronDown size={20} color={c.heading} />
          </View>
        </Pressable>
      </View>
      <ChoiceSheet
        open={open}
        label={props.label}
        Icon={props.Icon}
        value={props.value}
        choices={choices}
        onClose={() => setOpen(false)}
        onPick={(id) => {
          props.onChange(id);
          setOpen(false);
        }}
      />
    </>
  );
}
function ChoiceSheet(props: {
  open: boolean;
  label: string;
  Icon: LucideIcon;
  value: string | undefined;
  choices: { id: string | undefined; name: string }[];
  onClose: () => void;
  onPick: (id: string | undefined) => void;
}) {
  return (
    <Modal
      transparent
      visible={props.open}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => props.onClose()}
    >
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel={'Close ' + props.label.toLowerCase() + ' list'}
          style={StyleSheet.absoluteFill}
          onPress={() => props.onClose()}
        />
        <View style={styles.sheet} accessibilityLabel={props.label + ' choices'}>
          <View style={styles.head}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={8}
              onPress={() => props.onClose()}
              style={({ pressed }) => [styles.back, pressed && { opacity: 0.7 }]}
            >
              <ArrowLeft size={24} color={c.primary} />
            </Pressable>
            <Text className="font-heading" numberOfLines={1} style={styles.title}>
              {props.label}
            </Text>
          </View>
          <ScrollView contentContainerStyle={styles.list}>
            {props.choices.map((choice) => (
              <Choice
                key={choice.id ?? 'all'}
                name={choice.name}
                Icon={choice.id === undefined ? LayoutGrid : props.Icon}
                selected={choice.id === props.value}
                onPress={() => props.onPick(choice.id)}
              />
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
// One big row: icon in a circle, name, and a filled check on the chosen one.
function Choice(props: { name: string; Icon: LucideIcon; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: props.selected }}
      accessibilityLabel={props.name}
      onPress={props.onPress}
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <View style={[styles.choice, props.selected && styles.chosen]}>
        <View style={[styles.icon, props.selected && styles.iconChosen]}>
          <props.Icon size={24} color={props.selected ? c.surface : c.primary} />
        </View>
        <Text
          className="font-heading"
          numberOfLines={1}
          style={[styles.choiceText, props.selected && { color: c.primary }]}
        >
          {props.name}
        </Text>
        {props.selected ? <Check size={24} color={c.primary} /> : null}
      </View>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  pill: {
    ...mobileSurfaces.icyCard,
    minHeight: m.touch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: m.inputRadius,
    paddingHorizontal: 14,
  },
  value: {
    flexShrink: 1,
    marginRight: 'auto',
    color: c.heading,
    fontSize: m.body + 1,
    fontWeight: '700',
  },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: m.page,
    backgroundColor: 'rgba(16,59,48,0.38)',
  },
  sheet: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 440,
    maxHeight: '80%',
    backgroundColor: c.background,
    borderRadius: m.cardRadius + 6,
    paddingBottom: m.page,
    boxShadow: '0px 8px 28px rgba(0,77,56,0.22)',
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: m.page, paddingBottom: 8 },
  back: {
    ...mobileSurfaces.icyCard,
    width: m.touch,
    height: m.touch,
    borderRadius: m.touch / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, color: c.heading, fontSize: m.title, fontWeight: '700' },
  list: { paddingHorizontal: m.page, paddingTop: 8, gap: 10 },
  choice: {
    ...mobileSurfaces.icyCard,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderRadius: m.inputRadius + 4,
    paddingHorizontal: 14,
  },
  chosen: { borderColor: c.primary, borderWidth: 2, backgroundColor: c.primarySoft },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.primarySoft,
  },
  iconChosen: { backgroundColor: c.primary },
  choiceText: { flex: 1, color: c.heading, fontSize: m.body + 2, fontWeight: '700' },
});
