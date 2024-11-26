import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Building2, CalendarDays, Check, ChevronDown, X } from 'lucide-react-native';
import { mobileOwnerColors as c, mobileSurfaces, ownerMetrics as m } from '@hsm/ui';
import { monthName, shiftMonth } from './owner-month';
export function OwnerScopePicker({
  branches,
  chosen,
  onChoose,
  hasMore,
  month,
  latestMonth,
  onMonth,
}: {
  branches: { id: string; name: string }[];
  chosen?: string | undefined;
  onChoose: (id: string | undefined) => void;
  hasMore: boolean;
  month?: string | undefined;
  latestMonth?: string | undefined;
  onMonth?: ((month: string | undefined) => void) | undefined;
}) {
  const [monthCount, setMonthCount] = useState(24);
  const [open, setOpen] = useState<'branch' | 'month'>();
  const selected = branches.find((b) => b.id === chosen)?.name ?? 'All Branches';
  const latest = latestMonth ?? month;
  const options =
    open === 'branch'
      ? [{ id: '', name: 'All Branches' }, ...branches]
      : latest
        ? Array.from({ length: monthCount }, (_, i) => {
            const value = shiftMonth(latest, -i);
            return { id: value, name: monthName(value) };
          })
        : [];
  return (
    <>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={'Choose branch: ' + selected}
          onPress={() => setOpen('branch')}
          style={styles.pill}
        >
          <Building2 color={c.primary} size={23} />
          <Text className="font-heading" numberOfLines={1} style={styles.label}>
            {selected}
          </Text>
          <ChevronDown color={c.heading} size={17} />
        </Pressable>
        {onMonth ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose dashboard month"
            onPress={() => setOpen('month')}
            style={styles.pill}
          >
            <CalendarDays color={c.primary} size={22} />
            <Text
              className="font-heading"
              numberOfLines={1}
              adjustsFontSizeToFit
              style={styles.label}
            >
              {month ? monthName(month) : 'Loading…'}
            </Text>
            <ChevronDown color={c.heading} size={17} />
          </Pressable>
        ) : null}
      </View>
      <Modal
        visible={Boolean(open)}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(undefined)}
      >
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <View style={styles.row}>
              <Text className="font-heading" style={[styles.label, { fontSize: 18 }]}>
                {open === 'branch' ? 'Choose branch' : 'Choose month'}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close selector"
                onPress={() => setOpen(undefined)}
                style={styles.close}
              >
                <X color={c.heading} size={22} />
              </Pressable>
            </View>
            <ScrollView>
              {options.map((option) => (
                <Pressable
                  key={option.id}
                  accessibilityRole="button"
                  accessibilityLabel={option.name}
                  onPress={() => {
                    if (open === 'branch') onChoose(option.id || undefined);
                    else onMonth?.(option.id === latest ? undefined : option.id);
                    setOpen(undefined);
                  }}
                  style={styles.option}
                >
                  <Text className="font-heading" style={styles.label}>
                    {option.name}
                  </Text>
                  {option.id === (open === 'branch' ? (chosen ?? '') : month) ? (
                    <Check size={20} color={c.primary} />
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
            {open === 'month' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Earlier months"
                onPress={() => setMonthCount((count) => count + 24)}
                style={styles.option}
              >
                <Text style={styles.label}>Earlier months</Text>
              </Pressable>
            ) : null}
            {open === 'branch' && hasMore ? (
              <Text style={{ color: c.secondary }}>More branches in Properties</Text>
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  pill: {
    ...mobileSurfaces.dashboardGlass,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: m.touch,
    paddingHorizontal: 14,
    borderRadius: 40,
  },
  label: { color: c.heading, fontSize: 13, fontWeight: '700', flex: 1 },
  overlay: {
    flex: 1,
    backgroundColor: c.heading + '70',
    justifyContent: 'center',
    padding: m.page,
  },
  dialog: {
    ...mobileSurfaces.dashboardGlass,
    borderRadius: m.cardRadius,
    padding: m.page,
    maxHeight: '75%',
    gap: 12,
  },
  close: { width: m.touch, height: m.touch, alignItems: 'center', justifyContent: 'center' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: m.touch,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
});
