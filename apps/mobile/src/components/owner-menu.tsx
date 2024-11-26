import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, type Href } from 'expo-router';
import Constants from 'expo-constants';
import {
  HelpCircle,
  LogOut,
  Lock,
  Repeat,
  ShieldAlert,
  User,
  Users,
  ArrowLeft,
  BarChart3,
  Briefcase,
  Building2,
  ShieldCheck,
  Bell,
  FileText,
} from 'lucide-react-native';
import { mobileOwnerColors as c, mobileSurfaces, ownerMetrics as m } from '@hsm/ui';
import { safeMessage } from '../lib/messages';
import { rememberMode } from '../lib/owner-mode';
import { useSession } from './providers';
import { NatureBackground } from './visual-surfaces';
import { SetupText } from './owner-wizard-ui';
import { AdminInvitationEntry } from './admin/invitation';
import {
  OwnerAccountProfile,
  OwnerAccountGroup,
  OwnerAccountRows,
  type OwnerAccountItem,
} from './owner-account-ui';
import { OwnerTabBar, ownerTabIcons } from './owner-tab-bar';
import {
  CustomerAccountSection,
  type AccountSection,
} from './marketplace/customer-account-sections';

// Owner menu: every entry opens a real screen or states plainly why it is unavailable.
export function OwnerMenu({ open, close }: { open: boolean; close: () => void }) {
  const session = useSession();
  const profile = session.profile;
  const [error, setError] = useState<string>(),
    [leaving, setLeaving] = useState(false),
    [note, setNote] = useState<string>(),
    [section, setSection] = useState<AccountSection>();
  if (!profile || !profile.capabilities.owner || !open) return null;
  const go = (href: Href) => () => {
    close();
    router.push(href);
  };
  const userId = profile.user.id;
  // Keep existing destinations while grouping the Owner Account reference rows.
  const groups: { title: string; items: OwnerAccountItem[] }[] = [
    {
      title: 'Business & Setup',
      items: [
        { label: 'Owner Profile', short: 'Profile', Icon: User, onPress: go('/owner-profile') },
        {
          // CHG-041: open each hostel's setup; approved hostels send edits for re-verification.
          label: 'Hostel Setup',
          short: 'Hostel setup',
          Icon: Building2,
          onPress: go('/owner-properties'),
        },
        {
          label: 'Manager Access & Invitations',
          short: 'Managers',
          Icon: Users,
          onPress: go('/owner-invite'),
        },
        {
          label: 'Reports & Analytics',
          short: 'Reports',
          Icon: BarChart3,
          onPress: go('/owner-reports'),
        },
      ],
    },
    {
      title: 'Access & Security',
      items: [
        { label: 'Account & Security', short: 'Security', Icon: Lock, onPress: go('/security') },
        {
          label: profile.capabilities.customer ? 'Switch to Customer Mode' : 'Set up Customer Mode',
          detail: profile.capabilities.customer ? undefined : 'Complete a Customer profile first',
          short: profile.capabilities.customer ? 'Switch to customer view' : 'Set up customer view',
          Icon: Repeat,
          onPress: () => {
            close();
            if (!profile.capabilities.customer) return router.push('/customer-profile');
            void rememberMode(userId, 'customer');
            router.replace('/marketplace');
          },
        },
        { label: 'Notifications', Icon: Bell, onPress: go('/owner-notifications') },
        // Former Spaces screen: other role spaces, shown only to people who have them.
        ...(profile.capabilities.managerOf.length
          ? [
              {
                label: 'Manager workspace',
                short: 'Manager',
                Icon: Briefcase,
                onPress: go('/manager'),
              },
            ]
          : []),
        ...(profile.capabilities.admin
          ? [
              {
                label: 'Platform admin',
                short: 'Admin',
                Icon: ShieldCheck,
                onPress: () => {
                  close();
                  void rememberMode(userId, 'admin').then(() => router.replace('/admin'));
                },
              },
            ]
          : []),
      ],
    },
    {
      title: 'Support',
      items: [
        {
          label: 'Help & Support',
          short: 'Help & support',
          Icon: HelpCircle,
          onPress: go('/owner-help'),
        },
        {
          label: 'Terms and conditions',
          Icon: FileText,
          onPress: () => setSection('Terms and conditions'),
        },
        { label: 'Privacy Policy', Icon: ShieldCheck, onPress: () => setSection('Privacy Policy') },
      ],
    },
    {
      title: '',
      items: [
        {
          label: 'Delete Account',
          detail: 'Request through Help & Support',
          Icon: ShieldAlert,
          danger: true,
          onPress: () =>
            setNote(
              'In-app account deletion is not available. Request it through Help & Support; records are retained.',
            ),
        },
      ],
    },
  ];
  async function signOut() {
    setLeaving(true);
    setError(undefined);
    try {
      await session.logout();
      close();
      router.replace('/');
    } catch (failure) {
      setError(safeMessage(failure));
    } finally {
      setLeaving(false);
    }
  }
  return (
    <View style={styles.backdrop}>
      <NatureBackground />
      <SafeAreaView style={styles.sheet} accessibilityViewIsModal>
        {section ? (
          <ScrollView contentContainerStyle={styles.content}>
            <CustomerAccountSection
              actorId={userId}
              section={section}
              close={() => setSection(undefined)}
              open={setSection}
              canReview={false}
            />
          </ScrollView>
        ) : (
          <>
            <View style={styles.header}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close menu"
                onPress={close}
                style={styles.close}
              >
                <ArrowLeft size={m.stepIcon} color={c.primary} />
              </Pressable>
              <Text className="font-heading" style={styles.name}>
                Owner account
              </Text>
            </View>
            <ScrollView contentContainerStyle={styles.content}>
              <OwnerAccountProfile
                name={profile.user.fullName ?? 'Owner'}
                email={profile.user.email}
                onPress={go('/owner-profile')}
              />
              {groups.map((group) => (
                <OwnerAccountGroup key={group.title} title={group.title}>
                  <OwnerAccountRows items={group.items} />
                </OwnerAccountGroup>
              ))}
              {/* Shown only while this person has a pending Admin invitation. */}
              <AdminInvitationEntry />
              {note ? <SetupText alert>{note}</SetupText> : null}
              {error ? <SetupText alert>{error}</SetupText> : null}
              <OwnerAccountGroup>
                <OwnerAccountRows
                  items={[
                    {
                      label: 'Sign out',
                      short: leaving ? 'Signing out…' : 'Sign out',
                      Icon: LogOut,
                      disabled: leaving,
                      onPress: () => void signOut(),
                    },
                  ]}
                />
              </OwnerAccountGroup>
              <Text className="font-body" style={styles.version}>
                {'Version ' + (Constants.expoConfig?.version ?? 'unknown')}
              </Text>
            </ScrollView>
            <View style={styles.navigation}>
              <OwnerTabBar
                tabs={[
                  { label: 'Dashboard', Icon: ownerTabIcons.dashboard, onPress: go('/owner') },
                  {
                    label: 'Properties',
                    Icon: ownerTabIcons.properties,
                    onPress: go('/owner-properties'),
                  },
                  {
                    label: 'Operations',
                    Icon: ownerTabIcons.operations,
                    onPress: go('/owner-branch'),
                  },
                  {
                    label: 'Account',
                    Icon: ownerTabIcons.account,
                    active: true,
                    onPress: () => undefined,
                  },
                ]}
              />
            </View>
          </>
        )}
      </SafeAreaView>
    </View>
  );
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: c.background },
  sheet: {
    flex: 1,
    width: '100%',
    maxWidth: m.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: m.page,
    paddingTop: m.page,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: m.gap, marginBottom: m.gap },
  name: { color: c.heading, fontSize: m.title },
  close: {
    ...mobileSurfaces.glassEdge,
    backgroundColor: c.surface,
    borderRadius: m.touch,
    borderWidth: 1,
    borderColor: c.border,
    width: m.touch,
    height: m.touch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navigation: { marginHorizontal: -m.page },
  content: { gap: m.gap + 4, paddingBottom: m.section },
  version: { color: c.secondary, fontSize: m.small, textAlign: 'center' },
});
