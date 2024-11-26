import { OwnerDashboardBackground } from './owner-dashboard-background';
import { Skeleton } from './loading/skeleton';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { PullScrollView } from './pull-refresh';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { mobileOwnerColors as c, ownerMetrics as m } from '@hsm/ui';
import { safeMessage } from '../lib/messages';
import { useSession } from './providers';
import { OwnerDashboardHero } from './owner-dashboard-hero';
import { OwnerScopePicker } from './owner-scope-picker';
import { OwnerTabBar, ownerTabIcons } from './owner-tab-bar';
import { SetupButton, SetupCard, SetupText } from './owner-wizard-ui';
import { OwnerDashboardEmpty } from './owner-dashboard-empty';
import { OwnerDashboardActive } from './owner-dashboard-active';
import { useOwnerHome } from './use-owner-home';
export function OwnerHome() {
  const profile = useSession().profile;
  if (!profile) return null;
  return <Home key={profile.user.id} actorId={profile.user.id} />;
}
function Home({ actorId }: { actorId: string }) {
  const session = useSession();
  const insets = useSafeAreaInsets();
  const profile = session.profile;
  const [month, setMonth] = useState<string>(),
    [currentMonth, setCurrentMonth] = useState<string>(),
    [branchId, setBranchId] = useState<string>();
  const home = useOwnerHome(actorId, month, branchId);
  const served = home.dashboard.data?.month;
  if (!month && served && served !== currentMonth) setCurrentMonth(served);
  if (!profile) return null;
  const firstName = profile.user.fullName?.split(' ')[0] ?? 'Owner';
  const hostels = home.hostels.data ?? [];
  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <OwnerDashboardBackground />
      <PullScrollView
        contentContainerStyle={[styles.page, { paddingTop: insets.top + m.page - 4 }]}
      >
        <OwnerDashboardHero
          bleed={{
            top: insets.top + m.page - 4,
            horizontal: m.page - 4,
            bottom: m.section + m.gap,
          }}
          name={firstName}
          onMenu={() => router.push('/owner-menu')}
          onNotifications={() => router.push('/owner-notifications')}
          unread={home.notices.data?.unreadCount ?? 0}
        />
        {hostels.length ? (
          <OwnerScopePicker
            branches={home.branches.data?.data ?? []}
            chosen={branchId}
            onChoose={setBranchId}
            hasMore={Boolean(home.branches.data?.nextCursor)}
            month={home.dashboard.data?.month ?? month}
            latestMonth={currentMonth}
            onMonth={setMonth}
          />
        ) : null}
        {home.error ? (
          <SetupCard>
            <SetupText alert>{safeMessage(home.error)}</SetupText>
            <SetupButton label="Try again" onPress={() => void home.organizations.refetch()} />
          </SetupCard>
        ) : home.loading ? (
          <Skeleton kind="dashboard" label="Loading your hostels…" />
        ) : !home.organization ? (
          <SetupCard>
            <SetupText>Complete your Owner profile first.</SetupText>
            <SetupButton label="Owner profile" onPress={() => router.push('/owner-profile')} />
          </SetupCard>
        ) : hostels.length ? (
          <OwnerDashboardActive
            actorId={actorId}
            home={home}
            month={month}
            setMonth={setMonth}
            currentMonth={currentMonth}
            branchId={branchId}
          />
        ) : (
          <OwnerDashboardEmpty />
        )}
      </PullScrollView>
      <OwnerTabBar
        premium
        tabs={[
          {
            label: 'Dashboard',
            Icon: ownerTabIcons.dashboard,
            active: true,
            onPress: () => undefined,
          },
          {
            label: 'Properties',
            Icon: ownerTabIcons.properties,
            onPress: () => router.push('/owner-properties'),
          },
          {
            label: 'Operations',
            Icon: ownerTabIcons.operations,
            // One branch opens directly; several branches show the branch picker first.
            onPress: () => {
              const only =
                home.branches.data?.data.length === 1 ? home.branches.data.data[0] : undefined;
              router.push(
                only
                  ? { pathname: '/owner-branch', params: { branchId: only.id } }
                  : '/owner-branch',
              );
            },
          },
          {
            label: 'Account',
            Icon: ownerTabIcons.account,
            onPress: () => router.push('/owner-menu'),
          },
        ]}
      />
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
});
