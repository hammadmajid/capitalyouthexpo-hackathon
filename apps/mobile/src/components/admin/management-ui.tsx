import { mobileSurfaces } from '@hsm/ui';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react-native';
import { mobileColors as colors, icons, radii, spacing } from '@hsm/ui';
import { premiumShadow } from './premium-surface';

export function FilterPanel({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={s.panel}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Filters and sorting"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={s.row}
      >
        <SlidersHorizontal size={icons.size} color={colors.primary} />
        <Text className="font-heading text-body text-heading" style={s.grow}>
          Filters
        </Text>
        {open ? (
          <ChevronUp color={colors.primary} size={icons.size} />
        ) : (
          <ChevronDown color={colors.primary} size={icons.size} />
        )}
      </Pressable>
      {open ? <View style={s.content}>{children}</View> : null}
    </View>
  );
}
export function StatusBadge({ value }: { value: string }) {
  const positive = ['active', 'approved', 'resolved', 'published'].includes(value);
  const alert = ['rejected', 'banned', 'suspended', 'urgent', 'critical'].includes(value);
  const text = value.replaceAll('_', ' ');
  return (
    <View style={[s.badge, { borderColor: alert ? colors.dangerText : colors.border }]}>
      <Text
        className="font-heading text-sm"
        style={{ color: alert ? colors.dangerText : positive ? colors.primary : colors.secondary }}
      >
        {text.charAt(0).toUpperCase() + text.slice(1)}
      </Text>
    </View>
  );
}
export function WorkflowTabs({ sections }: { sections: { title: string; content: ReactNode }[] }) {
  const [selected, setSelected] = useState(0);
  return (
    <View style={s.content}>
      <View style={s.tabs}>
        {sections.map((section, index) => (
          <Pressable
            key={section.title}
            accessibilityRole="button"
            accessibilityLabel={section.title + ' tab'}
            accessibilityState={{ selected: selected === index }}
            onPress={() => setSelected(index)}
            style={[s.tab, selected === index && { backgroundColor: colors.deep }]}
          >
            <Text
              className="font-heading text-sm"
              style={{ color: selected === index ? colors.surface : colors.primary }}
            >
              {section.title}
            </Text>
          </Pressable>
        ))}
      </View>
      {sections.map((section, index) => (
        <View
          key={section.title}
          style={{ display: selected === index ? 'flex' : 'none', gap: spacing.md }}
          importantForAccessibility={selected === index ? 'auto' : 'no-hide-descendants'}
        >
          {section.content}
        </View>
      ))}
    </View>
  );
}
const s = StyleSheet.create({
  tab: {
    ...mobileSurfaces.icyCard,
    flex: 1,
    minHeight: spacing.touch,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: mobileSurfaces.icyCard.borderColor,
    backgroundColor: mobileSurfaces.icyCard.backgroundColor,
  },
  panel: {
    ...mobileSurfaces.icyCard,
    ...premiumShadow,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.input,
    backgroundColor: mobileSurfaces.icyCard.backgroundColor,
    borderWidth: 1,
    borderColor: mobileSurfaces.icyCard.borderColor,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: spacing.touch },
  grow: { flex: 1 },
  content: { gap: spacing.md, paddingVertical: spacing.sm },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.icy,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  // Equal-width tabs on one row, whatever each title's length.
  tabs: { flexDirection: 'row', gap: spacing.sm },
});
