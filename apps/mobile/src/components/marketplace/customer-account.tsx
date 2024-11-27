import { useCallback, useState } from 'react';
import { PullScrollView } from '../pull-refresh';
import { BackHandler, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  BedDouble,
  Bell,
  CalendarDays,
  Clock3,
  FileText,
  Headphones,
  Heart,
  Languages,
  LogOut,
  MapPin,
  MessageCircle,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react-native';
import { mobileColors as c, marketplaceMetrics as m } from '@hsm/ui';
import { safeMessage } from '../../lib/messages';
import { useSession } from '../providers';
import { NavIconButton } from '../navigation/header';
import { useCurrentResidentStay } from './customer-account-data';
import {
  CustomerAccountPreferences,
  CustomerAccountSection,
  type AccountSection,
} from './customer-account-sections';
import {
  AccountGroup,
  AccountProfileShortcut,
  AccountRows,
  accountStyles as s,
} from './customer-account-ui';

export function CustomerAccount({
  actorId,
  unreadCount,
  saved,
  back,
}: {
  actorId: string;
  unreadCount: number | undefined;
  saved: () => void;
  back: () => void;
}) {
  const session = useSession();
  const [sections, setSections] = useState<AccountSection[]>([]);
  const section = sections.at(-1);
  useFocusEffect(
    useCallback(() => {
      if (section) return;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        back();
        return true;
      });
      return () => subscription.remove();
    }, [back, section]),
  );
  const open = (next: AccountSection) => setSections((previous) => [...previous, next]);
  const close = () => setSections((previous) => previous.slice(0, -1));
  const canReview = Boolean(
    session.profile?.features?.profileReviews && !session.profile.capabilities.admin,
  );
  return (
    <PullScrollView
      key={section ?? 'account'}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={s.content}
    >
      {section ? (
        <CustomerAccountSection
          actorId={actorId}
          section={section}
          close={close}
          open={open}
          canReview={canReview}
        />
      ) : (
        <AccountOverview
          actorId={actorId}
          unreadCount={unreadCount}
          saved={saved}
          back={back}
          open={open}
          canReview={canReview}
        />
      )}
    </PullScrollView>
  );
}

function AccountOverview({
  actorId,
  unreadCount,
  saved,
  back,
  open,
  canReview,
}: {
  actorId: string;
  unreadCount: number | undefined;
  saved: () => void;
  back: () => void;
  open: (section: AccountSection) => void;
  canReview: boolean;
}) {
  const stay = useCurrentResidentStay(actorId);
  const resident = stay.data === true;
  const rows = [
    { label: 'My bookings', Icon: CalendarDays, onPress: () => open('My bookings') },
    {
      label: resident ? 'Resident services' : 'My stays',
      Icon: BedDouble,
      ...(resident ? { detail: 'Rent, invoices and hostel requests' } : {}),
      onPress: () => open('My stays'),
    },
    { label: 'Saved hostels', Icon: Heart, onPress: saved },
    { label: 'My visits', Icon: MapPin, onPress: () => open('My visits') },
    { label: 'Waiting list', Icon: Clock3, onPress: () => open('Waiting list') },
  ];
  return (
    <>
      <View style={[s.row, s.header]}>
        <NavIconButton onPress={back} />
        <Text accessibilityRole="header" className="font-heading" style={[s.name, s.grow]}>
          Customer Account
        </Text>
        <NavIconButton
          label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          onPress={() => open('Notifications')}
        >
          <Bell color={c.primary} size={m.iconSize} />
          {unreadCount ? <Text style={s.link}>{unreadCount}</Text> : null}
        </NavIconButton>
      </View>
      <AccountProfileShortcut />
      <AccountGroup title="Account">
        <CustomerAccountPreferences canReview={canReview} open={open} />
        <AccountRows
          rows={[{ label: 'Languages', Icon: Languages, onPress: () => open('Languages') }]}
        />
      </AccountGroup>
      <AccountGroup title="Bookings & Stays">
        <AccountRows rows={rows} />
      </AccountGroup>
      <AccountGroup title="Communication">
        <AccountRows
          rows={[{ label: 'Messages', Icon: MessageCircle, onPress: () => open('Messages') }]}
        />
      </AccountGroup>
      <AccountGroup title="Support & Legal">
        <AccountRows
          rows={[
            { label: 'Help & support', Icon: Headphones, onPress: () => open('Help & support') },
            {
              label: 'Terms and conditions',
              Icon: FileText,
              onPress: () => open('Terms and conditions'),
            },
            { label: 'Privacy Policy', Icon: ShieldCheck, onPress: () => open('Privacy Policy') },
          ]}
        />
      </AccountGroup>
      <AccountGroup>
        <AccountSignOut />
      </AccountGroup>
    </>
  );
}

export function AccountSignOut() {
  const { logout } = useSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  async function leave() {
    setPending(true);
    setError(undefined);
    try {
      await logout();
      router.replace('/');
    } catch (failure) {
      setError(safeMessage(failure));
      setPending(false);
    }
  }
  return (
    <>
      <Pressable
        accessibilityRole="button"
        disabled={pending}
        accessibilityState={{ disabled: pending, busy: pending }}
        onPress={() => void leave()}
        android_ripple={{ color: c.aqua }}
        style={s.menuRow}
      >
        <View style={s.iconTile}>
          <LogOut color={c.primary} size={m.iconSize - 3} accessible={false} />
        </View>
        <Text className="font-heading" style={[s.label, s.grow]}>
          {pending ? 'Signing out…' : 'Sign out'}
        </Text>
        <ChevronRight size={m.iconSize - 4} color={c.secondary} accessible={false} />
      </Pressable>
      {error ? (
        <Text accessibilityRole="alert" style={s.feedback}>
          {error}
        </Text>
      ) : null}
    </>
  );
}
