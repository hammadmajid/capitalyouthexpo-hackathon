import { router } from 'expo-router';
import {
  Building2,
  Mail,
  ShieldCheck,
  UserRound,
  UserRoundCog,
  type LucideIcon,
} from 'lucide-react-native';
import { canAssociateEmail, ClientFailure } from '@hsm/api-client';
import { canEnter } from '../../lib/capabilities';
import { rememberMode } from '../../lib/owner-mode';
import { useSession } from '../providers';
import { EmailAssociation } from '../email-association';
import { AdminInvitationEntry } from '../admin/invitation';
import { AppHeader } from '../navigation/header';
import { CustomerBookings } from '../customer-bookings';
import { StayDirectory } from '../stay-directory';
import { Inbox } from '../inbox';
import { Visits } from '../visits';
import { Waitlist } from '../waitlist';
import { Chat } from '../chat';
import { NativeHelpSupport } from '../services/platform';
import { NativeOwnProfileReviews } from '../own-profile-reviews';
import { AccountGroup, AccountRows, openCustomerProfile } from './customer-account-ui';
import { Copy } from '../ui';

export type AccountSection =
  | 'Notifications'
  | 'My bookings'
  | 'My stays'
  | 'My visits'
  | 'Waiting list'
  | 'Messages'
  | 'Help & support'
  | 'Terms and conditions'
  | 'Privacy Policy'
  | 'Languages'
  | 'Profile reviews'
  | 'Verify email';

export function CustomerAccountSection({
  actorId,
  section,
  close,
  open,
  canReview,
}: {
  actorId: string;
  section: AccountSection;
  close: () => void;
  open: (section: AccountSection) => void;
  canReview: boolean;
}) {
  return (
    <>
      <AppHeader title={section} onBack={close} />
      <SectionBody actorId={actorId} section={section} open={open} canReview={canReview} />
    </>
  );
}

function SectionBody({
  actorId,
  section,
  open,
  canReview,
}: {
  actorId: string;
  section: AccountSection;
  open: (section: AccountSection) => void;
  canReview: boolean;
}) {
  switch (section) {
    case 'Notifications':
      return (
        <Inbox
          actorId={actorId}
          hideHeading
          onMessages={() => open('Messages')}
          onVisitSpace={() => open('My visits')}
          onWaitlist={() => open('Waiting list')}
          onVisits={() => open('My visits')}
        />
      );
    case 'My bookings':
      return <CustomerBookings actorId={actorId} hideHeading />;
    case 'My stays':
      return <StayDirectory actorId={actorId} standalone />;
    case 'My visits':
      return <Visits actorId={actorId} standalone />;
    case 'Waiting list':
      return <Waitlist actorId={actorId} standalone />;
    case 'Messages':
      return <Chat actorId={actorId} standalone />;
    case 'Help & support':
      return <NativeHelpSupport actorId={actorId} standalone />;
    case 'Languages':
      return (
        <AccountGroup>
          <Copy>English · Current language</Copy>
        </AccountGroup>
      );
    case 'Privacy Policy':
      return (
        <>
          <Copy>HSM uses account details to sign you in and manage your bookings and stays.</Copy>
          <Copy>
            Public hostel listings do not display residents’ identities or rent status. Access to
            private stay records and uploaded documents is restricted.
          </Copy>
          <Copy>Contact Help & support with questions about your information.</Copy>
          <AccountRows
            rows={[{ label: 'Help & support', Icon: Mail, onPress: () => open('Help & support') }]}
          />
        </>
      );
    case 'Terms and conditions':
      return (
        <>
          <Copy>
            Review the hostel’s booking terms, charges and cancellation rules before you confirm a
            booking.
          </Copy>
          <Copy>
            Pay rent and deposits directly to the hostel. HSM records payment proof for the hostel
            to verify.
          </Copy>
        </>
      );
    case 'Profile reviews':
      return canReview ? <NativeOwnProfileReviews standalone /> : null;
    case 'Verify email':
      return <CustomerSpaceSection actorId={actorId} section={section} />;
  }
}

function CustomerSpaceSection({ actorId }: { actorId: string; section: 'Verify email' }) {
  const { profile, refetch } = useSession();
  if (!profile || profile.user.id !== actorId) return null;
  if (!canAssociateEmail(profile)) return null;
  return (
    <EmailAssociation
      userId={actorId}
      onVerified={async (verified) => {
        const fresh = await refetch();
        if (
          fresh?.user.id !== actorId ||
          !fresh.user.emailVerified ||
          fresh.user.email !== verified.user.email
        )
          throw new ClientFailure('INVALID_RESPONSE');
      }}
    />
  );
}

export function CustomerAccountPreferences({
  canReview,
  open,
}: {
  canReview: boolean;
  open: (section: AccountSection) => void;
}) {
  const { profile } = useSession();
  if (!profile) return null;
  const rows: { label: string; Icon: LucideIcon; onPress: () => void }[] = [
    {
      label: 'Profile',
      Icon: UserRound,
      onPress: openCustomerProfile,
    },
    { label: 'Account security', Icon: ShieldCheck, onPress: () => router.push('/security') },
  ];
  const access: typeof rows = [];
  if (canReview)
    rows.push({
      label: 'Profile reviews',
      Icon: UserRoundCog,
      onPress: () => open('Profile reviews'),
    });
  if (canEnter(profile, 'admin'))
    access.push({
      label: 'Switch to Admin',
      Icon: ShieldCheck,
      onPress: () => {
        void rememberMode(profile.user.id, 'admin');
        router.replace('/admin');
      },
    });
  if (profile.user.emailVerified) {
    access.push({
      label: canEnter(profile, 'owner') ? 'Switch to Owner' : 'Set up Owner profile',
      Icon: Building2,
      onPress: () => {
        if (!canEnter(profile, 'owner')) {
          router.push('/owner-profile');
          return;
        }
        void rememberMode(profile.user.id, 'owner');
        router.replace('/owner');
      },
    });
  }
  if (canEnter(profile, 'manager'))
    access.push({
      // MGRD: one Manager workspace; no second inline branch list here.
      label: 'Manager workspace',
      Icon: Building2,
      onPress: () => router.push('/manager'),
    });
  if (canAssociateEmail(profile))
    rows.push({
      label: 'Verify email',
      Icon: Mail,
      onPress: () => open('Verify email'),
    });
  return (
    <>
      <AccountRows rows={[...rows, ...access]} />
      <AdminInvitationEntry />
    </>
  );
}
