import { NativeOwnProfileReviews } from './own-profile-reviews';
import { AdminInvitationEntry } from './admin/invitation';
import { StayDirectory } from './stay-directory';
import { Visits } from './visits';
import { NativeHelpSupport } from './services/platform';
import { Waitlist } from './waitlist';
import { Chat } from './chat';
import { CustomerBookings } from './customer-bookings';
import { Inbox } from './inbox';
import { Bell } from 'lucide-react-native';
import { mobileColors } from '@hsm/ui';
import { NavIconButton } from './navigation/header';
import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { canAssociateEmail, ClientFailure } from '@hsm/api-client';
import { EmailAssociation } from './email-association';
import { router, Redirect } from 'expo-router';
import { canEnter, contexts, type Context } from '../lib/capabilities';
import { rememberMode } from '../lib/owner-mode';
import { safeMessage } from '../lib/messages';
import { useSession } from './providers';
import { Branches } from './branches';
import { Page } from './frame';
import { Button, Copy } from './ui';
const labels: Record<Context, string> = {
  customer: 'Customer',
  resident: 'Resident',
  owner: 'Owner',
  manager: 'Manager',
  admin: 'Platform admin',
};
export function AccountWorkspace({ onBack }: { onBack?: () => void } = {}) {
  const session = useSession();
  const [showInbox, setShowInbox] = useState(false);
  const [showBookings, setShowBookings] = useState(false);
  const [context, setContext] = useState<Context>();
  const [error, setError] = useState<string>();
  const [leaving, setLeaving] = useState(false);
  if (!session.profile) return <Redirect href="/" />;
  const profile = session.profile;
  const active =
    context && canEnter(profile, context)
      ? context
      : contexts.find((item) => canEnter(profile, item));
  const messageContext = [active, ...contexts].find(
    (item) =>
      item !== undefined &&
      ['customer', 'owner', 'manager'].includes(item) &&
      canEnter(profile, item),
  );
  async function logout() {
    setLeaving(true);
    setError(undefined);
    try {
      await session.logout();
      router.replace('/');
    } catch (failure) {
      setError(safeMessage(failure));
    } finally {
      setLeaving(false);
    }
  }
  return (
    <Page
      primary={!onBack}
      {...(onBack ? { onBack } : {})}
      title={profile.user.fullName || 'Account'}
      contentWidth={760}
      actions={
        <NavIconButton
          label={showInbox ? 'Close notifications' : 'Notifications'}
          onPress={() => setShowInbox((value) => !value)}
        >
          <Bell size={20} color={mobileColors.primary} />
        </NavIconButton>
      }
    >
      {profile.features?.profileReviews && !profile.capabilities.admin ? (
        <NativeOwnProfileReviews key={'reviews:' + profile.user.id} />
      ) : null}
      {showInbox ? (
        <Inbox
          key={'inbox:' + profile.user.id}
          actorId={profile.user.id}
          {...(messageContext
            ? {
                onMessages: () => {
                  setContext(messageContext);
                  setShowInbox(false);
                },
                onVisitSpace: () => {
                  setContext(messageContext);
                  setShowInbox(false);
                },
              }
            : {})}
          {...(profile.capabilities.customer
            ? {
                onWaitlist: () => {
                  setContext('customer');
                  setShowInbox(false);
                },
                onVisits: () => {
                  setContext('customer');
                  setShowInbox(false);
                },
              }
            : {})}
        />
      ) : null}
      <AccountGroup title="Spaces">
        <View className="flex-row flex-wrap gap-2">
          {contexts
            .filter((item) => canEnter(profile, item))
            .map((item) => (
              <Button
                key={item}
                label={labels[item]}
                secondary={active !== item}
                disabled={!canEnter(profile, item)}
                onPress={() => {
                  if (item === 'admin') {
                    void rememberMode(profile.user.id, 'admin').then(() =>
                      router.replace('/admin'),
                    );
                  } else if (item === 'manager') router.push('/manager');
                  else setContext(item);
                }}
              />
            ))}
        </View>
        {!active ? <Copy>No active spaces.</Copy> : null}
      </AccountGroup>
      {canAssociateEmail(profile) ? (
        <EmailAssociation
          key={'email:' + profile.user.id}
          userId={profile.user.id}
          onVerified={async (verified) => {
            const fresh = await session.refetch();
            if (
              fresh?.user.id !== verified.user.id ||
              !fresh.user.emailVerified ||
              fresh.user.email !== verified.user.email
            )
              throw new ClientFailure('INVALID_RESPONSE');
          }}
        />
      ) : null}
      {profile.user.emailVerified ? (
        <AccountGroup title="Profiles">
          <Button
            label={
              profile.capabilities.customer ? 'Edit Customer profile' : 'Complete Customer profile'
            }
            onPress={() => router.push('/customer-profile')}
          />
          <Button
            label={profile.capabilities.owner ? 'Edit Owner profile' : 'Complete Owner profile'}
            onPress={() => router.push('/owner-profile')}
          />
        </AccountGroup>
      ) : null}
      <AccountGroup title={active === 'customer' ? 'Trips and stays' : 'Stays'}>
        {active === 'customer' ? (
          <Button label="Find hostels" onPress={() => router.push('/marketplace')} />
        ) : null}
        {active === 'customer' ? (
          <Button
            secondary
            label={showBookings ? 'Close bookings' : 'My bookings'}
            onPress={() => setShowBookings((value) => !value)}
          />
        ) : null}
        <StayDirectory actorId={profile.user.id} />
        {active === 'customer' ? <Visits actorId={profile.user.id} /> : null}
        {active === 'customer' ? <Waitlist actorId={profile.user.id} /> : null}
        {active === 'customer' ? <Chat actorId={profile.user.id} /> : null}
        {active === 'customer' && showBookings ? (
          <CustomerBookings actorId={profile.user.id} />
        ) : null}
      </AccountGroup>
      {/* MGRD: Manager branch tools live in the Manager workspace (/manager). */}
      {active === 'owner' ? (
        <Branches key={profile.user.id + ':' + active} context={active} actorId={profile.user.id} />
      ) : null}
      {active === 'manager' ? (
        <Button label="Open Manager workspace" onPress={() => router.push('/manager')} />
      ) : null}
      {active === 'owner' && profile.user.emailVerified ? (
        <Button
          label="Open Owner dashboard"
          onPress={() => {
            void rememberMode(profile.user.id, 'owner');
            router.replace('/owner');
          }}
        />
      ) : null}
      <AccountGroup title="Settings">
        <Button secondary label="Account security" onPress={() => router.push('/security')} />
        <NativeHelpSupport actorId={profile.user.id} />
        <AdminInvitationEntry />
        {profile.user.cnicLast4 ? <Copy>CNIC ending in {profile.user.cnicLast4}</Copy> : null}
        {error ? <Copy alert>{error}</Copy> : null}
        <Button
          label={leaving ? 'Signing out…' : 'Sign out'}
          disabled={leaving}
          onPress={() => {
            void logout();
          }}
        />
      </AccountGroup>
    </Page>
  );
}

function AccountGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-3">
      <Text accessibilityRole="header" className="font-heading text-body text-heading">
        {title}
      </Text>
      {children}
    </View>
  );
}
