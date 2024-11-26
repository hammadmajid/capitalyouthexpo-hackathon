import { View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { mobileColors } from '@hsm/ui';
import { SetupHeading, SetupText } from './owner-wizard-ui';
// Card heading with an icon badge and a one-line note.
export function IconHead(props: { Icon: LucideIcon; title: string; note?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View className="h-11 w-11 items-center justify-center rounded-pill bg-aqua">
        <props.Icon size={22} color={mobileColors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <SetupHeading>{props.title}</SetupHeading>
        {props.note ? <SetupText muted>{props.note}</SetupText> : null}
      </View>
    </View>
  );
}
