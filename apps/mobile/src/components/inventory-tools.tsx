import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { mobileColors as colors } from '@hsm/ui';
// A tool opened from the branch tool grid starts open and returns to the grid when it closes.
// Outside the grid (tests, other screens) the tool keeps its own collapsed launcher.
const ToolContext = createContext<{ close: () => void } | undefined>(undefined);
export function useToolOpen(initial = false) {
  const tool = useContext(ToolContext);
  const [open, setOpenState] = useState(tool ? true : initial);
  const setOpen = useCallback(
    (value: boolean) => {
      setOpenState(value);
      if (!value) tool?.close();
    },
    [tool],
  );
  return [open, setOpen] as const;
}
export function ToolFrame({ close, children }: { close: () => void; children: ReactNode }) {
  return <ToolContext.Provider value={{ close }}>{children}</ToolContext.Provider>;
}
// Two columns for 2 or 4 tiles so none is left alone on a full-width row; else three.
const columns = (count: number) => (count === 2 || count === 4 ? '45%' : '30%');
export type Tool = { key: string; label: string; short: string; Icon: LucideIcon };
export function ToolGrid({
  tools,
  onOpen,
  disabled = false,
  selected,
}: {
  tools: Tool[];
  onOpen: (key: string) => void;
  disabled?: boolean;
  selected?: string | undefined;
}) {
  return (
    <View className="flex-row flex-wrap gap-3">
      {tools.map(({ key, label, short, Icon }) => (
        <Pressable
          key={key}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ disabled, selected: selected === key }}
          disabled={disabled}
          onPress={() => onOpen(key)}
          style={{ flexBasis: columns(tools.length), flexGrow: 1, opacity: disabled ? 0.5 : 1 }}
          className={
            'min-h-24 items-center justify-center gap-2 rounded-card border p-3 ' +
            (selected === key ? 'border-primary bg-aqua' : 'border-border bg-icy')
          }
        >
          <View className="h-10 w-10 items-center justify-center rounded-pill bg-aqua">
            <Icon size={20} color={colors.primary} />
          </View>
          <Text className="text-center font-heading text-xs text-heading" numberOfLines={2}>
            {short}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
// Small inline pieces shared by the inventory rows and their launchers.
export function InvFact({ Icon, children }: { Icon: LucideIcon; children: ReactNode }) {
  return (
    <View className="flex-row items-center gap-2">
      <Icon size={16} color={colors.secondary} />
      <Text className="flex-1 font-body text-sm text-text">{children}</Text>
    </View>
  );
}
export function IconChip({
  Icon,
  text,
  label,
  onPress,
  disabled = false,
}: {
  Icon: LucideIcon;
  text?: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{ opacity: disabled ? 0.5 : 1 }}
      className="min-h-10 flex-row items-center justify-center gap-1 rounded-pill border border-border bg-icy px-3"
    >
      <Icon size={16} color={colors.primary} />
      {text ? <Text className="font-heading text-sm text-primary">{text}</Text> : null}
    </Pressable>
  );
}
const tones: Record<string, string> = {
  active: colors.success,
  inactive: colors.secondary,
  maintenance: colors.gold,
  archived: colors.dangerText,
  check_in_ready: colors.primary,
  notice_given: colors.gold,
  checkout_pending: colors.gold,
  completed: colors.secondary,
  cancelled_before_checkin: colors.secondary,
  terminated: colors.dangerText,
  abandoned: colors.dangerText,
  // Rent states: green only for a server-confirmed paid invoice.
  overdue: colors.dangerText,
  proof_pending: colors.gold,
  partially_paid: colors.gold,
  issued: colors.primary,
  paid: colors.success,
  // Bed states.
  available: colors.success,
  occupied: colors.primary,
  reserved: colors.gold,
  blocked: colors.dangerText,
};
export function StatusDot({ status, text }: { status: string; text?: string }) {
  const tone = tones[status] ?? colors.secondary;
  return (
    <View className="flex-row items-center gap-1">
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tone }} />
      <Text className="font-body text-xs" style={{ color: tone }}>
        {text ?? status.charAt(0).toUpperCase() + status.slice(1)}
      </Text>
    </View>
  );
}
// Filter toggle: short visible text, full accessible name, selected state for readers.
export function FilterChip({
  text,
  label,
  selected,
  onPress,
  grow = false,
}: {
  text: string;
  label: string;
  selected: boolean;
  onPress: () => void;
  // Grow chips share rows evenly (3 per row) instead of leaving one alone on a line.
  grow?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={grow ? { flexGrow: 1, flexBasis: '30%' } : undefined}
      className={
        'min-h-10 justify-center rounded-pill border px-4 ' +
        (grow ? 'items-center ' : '') +
        (selected ? 'border-primary bg-primary' : 'border-border bg-icy')
      }
    >
      <Text className={'font-heading text-sm ' + (selected ? 'text-surface' : 'text-primary')}>
        {text}
      </Text>
    </Pressable>
  );
}
