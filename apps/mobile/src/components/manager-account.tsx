import { useState } from 'react';
import { PullScrollView } from './pull-refresh';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  Bell,
  Building2,
  FileText,
  Headphones,
  ShieldCheck,
  ShoppingBag,
  UserRound,
} from 'lucide-react-native';
import { mobileColors as c, marketplaceMetrics as m } from '@hsm/ui';
import { canEnter } from '../lib/capabilities';
import { rememberMode } from '../lib/owner-mode';
import { NavIconButton } from './navigation/header';
import { useSession } from './providers';
import { NatureBackground } from './visual-surfaces';
import { ManagerTabBar } from './manager-tab-bar';
import { AccountSignOut } from './marketplace/customer-account';
import {
  CustomerAccountSection,
  type AccountSection,
} from './marketplace/customer-account-sections';
import {
  AccountGroup,
  AccountProfileShortcut,
  AccountRows,
  accountStyles as s,
  openCustomerProfile,
} from './marketplace/customer-account-ui';
// MGRD / ACC-002: Manager account and settings, in the same layout as the Customer account.
export function ManagerAccount() {
  const profile = useSession().profile;
  const [section, setSection] = useState<AccountSection>();
  if (!profile) return null;
  const branches = profile.capabilities.managerOf;
  const switches = [
    ...(canEnter(profile, 'customer')
      ? [
          {
            label: 'Switch to Customer',
            Icon: ShoppingBag,
            onPress: () => {
              void rememberMode(profile.user.id, 'customer');
              router.replace('/marketplace');
            },
          },
        ]
      : []),
    ...(canEnter(profile, 'owner') && profile.user.emailVerified
      ? [
          {
            label: 'Switch to Owner',
            Icon: Building2,
            onPress: () => {
              void rememberMode(profile.user.id, 'owner');
              router.replace('/owner');
            },
          },
        ]
      : []),
    ...(canEnter(profile, 'admin')
      ? [
          {
            label: 'Switch to Admin',
            Icon: ShieldCheck,
            onPress: () => {
              void rememberMode(profile.user.id, 'admin');
              router.replace('/admin');
            },
          },
        ]
      : []),
  ];
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: c.background }}
      edges={['top', 'left', 'right']}
    >
      <NatureBackground />
      <PullScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
        {section ? (
          <CustomerAccountSection
            actorId={profile.user.id}
            section={section}
            close={() => setSection(undefined)}
            open={setSection}
            canReview={false}
          />
        ) : (
          <>
            <View style={[s.row, s.header]}>
              <Text accessibilityRole="header" className="font-heading" style={[s.name, s.grow]}>
                Manager Account
              </Text>
              <NavIconButton label="Notifications" onPress={() => setSection('Notifications')}>
                <Bell color={c.primary} size={m.iconSize} />
              </NavIconButton>
            </View>
            <AccountProfileShortcut
              title={profile.user.fullName || 'HSM Manager'}
              subtitle="Manager workspace"
            />
            <AccountGroup title="Account">
              <AccountRows
                rows={[
                  { label: 'Profile', Icon: UserRound, onPress: openCustomerProfile },
                  {
                    label: 'Account security',
                    Icon: ShieldCheck,
                    onPress: () => router.push('/security'),
                  },
                  ...switches,
                ]}
              />
            </AccountGroup>
            <AccountGroup title="Branch">
              <AccountRows
                rows={branches.map((branch) => ({
                  label: branch.branchName,
                  detail: 'Assigned branch',
                  Icon: Building2,
                  onPress: () => router.replace('/manager'),
                }))}
              />
            </AccountGroup>
            <AccountGroup title="Support & Legal">
              <AccountRows
                rows={[
                  {
                    label: 'Help & support',
                    Icon: Headphones,
                    onPress: () => setSection('Help & support'),
                  },
                  {
                    label: 'Terms and conditions',
                    Icon: FileText,
                    onPress: () => setSection('Terms and conditions'),
                  },
                  {
                    label: 'Privacy Policy',
                    Icon: ShieldCheck,
                    onPress: () => setSection('Privacy Policy'),
                  },
                ]}
              />
            </AccountGroup>
            <AccountGroup>
              <AccountSignOut />
            </AccountGroup>
          </>
        )}
      </PullScrollView>
      <ManagerTabBar active="account" />
    </SafeAreaView>
  );
}
