import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { mobileColors as c, mobileSurfaces, ownerMetrics as m } from '@hsm/ui';

export function StaffSetupFooter({ children }: { children: ReactNode }) {
  return (
    <View testID="setup-fixed-footer" style={s.footer}>
      <View style={s.content}>{children}</View>
    </View>
  );
}
const s = StyleSheet.create({
  footer: {
    ...mobileSurfaces.icyCard,
    borderTopLeftRadius: m.cardRadius + m.smallGap,
    borderTopRightRadius: m.cardRadius + m.smallGap,
    borderWidth: 1,
    borderColor: c.surface,
    padding: m.page,
    paddingBottom: m.smallGap,
    backgroundColor: mobileSurfaces.navigation.backgroundColor,
  },
  content: { maxWidth: m.contentMaxWidth, width: '100%', alignSelf: 'center' },
});
