import { Pressable, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { mobileColors as c } from '@hsm/ui';
// Paging appears only when there is more than one page, so short lists stay clean.
export function ListPager(props: {
  first: string;
  next: string;
  hasPrevious: boolean;
  hasNext: boolean;
  disabled?: boolean;
  onFirst: () => void;
  onNext: () => void;
}) {
  if (!props.hasPrevious && !props.hasNext) return null;
  const item = (label: string, text: string, on: boolean, press: () => void, back: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !on || Boolean(props.disabled) }}
      disabled={!on || props.disabled}
      onPress={press}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: 8,
        paddingHorizontal: 12,
        opacity: on && !props.disabled ? 1 : 0.35,
      }}
    >
      {back ? <ChevronLeft color={c.primary} size={18} /> : null}
      <Text style={{ color: c.primary, fontWeight: '600' }}>{text}</Text>
      {back ? null : <ChevronRight color={c.primary} size={18} />}
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      {item(props.first, 'First', props.hasPrevious, props.onFirst, true)}
      {item(props.next, 'Next', props.hasNext, props.onNext, false)}
    </View>
  );
}
