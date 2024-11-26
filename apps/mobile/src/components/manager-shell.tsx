import type { ReactNode } from 'react';
import { PullScrollView } from './pull-refresh';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { mobileOwnerColors as c, ownerMetrics as m } from '@hsm/ui';
import { NatureBackground } from './visual-surfaces';
import { ManagerTabBar } from './manager-tab-bar';
// MGRD: a Manager tab page — title, scrolling content and the bottom navigation.
export function ManagerShell({
  title,
  tab,
  children,
}: {
  title?: string;
  tab: Parameters<typeof ManagerTabBar>[0]['active'];
  children: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <NatureBackground />
      <PullScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
        {title ? (
          <Text accessibilityRole="header" className="font-heading" style={styles.title}>
            {title}
          </Text>
        ) : null}
        {children}
      </PullScrollView>
      <ManagerTabBar active={tab} />
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  page: {
    padding: m.page - 4,
    gap: m.section - 4,
    paddingBottom: m.section * 2,
    maxWidth: m.contentMaxWidth,
    width: '100%',
    alignSelf: 'center',
  },
  title: { color: c.heading, fontSize: m.title + 2 },
});
