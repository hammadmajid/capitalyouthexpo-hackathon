import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  CalendarDays,
  ChevronRight,
  IdCard,
  Link2,
  Mail,
  Phone,
  UserRound,
} from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { readResidentProfile } from '@hsm/api-client';
import { formatDate } from '@hsm/contracts';
import { mobileColors as colors, mobileSurfaces } from '@hsm/ui';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { AppHeader } from './navigation/header';
import { Skeleton } from './loading/skeleton';
import { InvFact, StatusDot } from './inventory-tools';
import { Copy } from './ui';
import { StaffStayWorkspace } from './staff-stay-workspace';
import { useOwnerScreenBack } from './owner-screen-back';
const stateText: Record<string, string> = {
  check_in_ready: 'Moving in',
  active: 'Living here',
  notice_given: 'Notice given',
  checkout_pending: 'Checking out',
  completed: 'Left',
  cancelled_before_checkin: 'Cancelled',
  terminated: 'Ended early',
  abandoned: 'Abandoned',
};
const stateDot: Record<string, string> = {
  check_in_ready: 'reserved',
  active: 'active',
  notice_given: 'reserved',
  checkout_pending: 'blocked',
};
const day = (value: string) => formatDate(value + 'T00:00:00.000Z');
// RES-004 / CHG-009: one person: contact details and every stay, newest first. A stay opens
// the same authorised Stay details used from the Bed Board (rent, agreement, checkout).
export function ResidentProfile(props: {
  actorId: string;
  branchId: string;
  residentId: string;
  onClose: () => void;
}) {
  useOwnerScreenBack(props.onClose, true, 0);
  const [stayId, setStayId] = useState<string>();
  const [historyOpen, setHistoryOpen] = useState(false);
  const profile = useQuery({
    queryKey: ['resident-profile', props.actorId, props.branchId, props.residentId],
    gcTime: 0,
    retry: false,
    queryFn: async () =>
      readResidentProfile(await actorClient(props.actorId), props.branchId, props.residentId),
  });
  const data = profile.data;
  const defaultStay =
    data?.currentStay?.id ??
    [...(data?.stays ?? [])].sort((a, b) => b.moveInDate.localeCompare(a.moveInDate))[0]?.id;
  const selectedStay = stayId ?? defaultStay;
  if (selectedStay && !historyOpen)
    return (
      <StaffStayWorkspace
        actorId={props.actorId}
        branchId={props.branchId}
        stayId={selectedStay}
        onClose={props.onClose}
        onHistory={() => setHistoryOpen(true)}
      />
    );
  return (
    <View className="gap-4" accessibilityLabel="Resident profile">
      <AppHeader title="Resident details" backLabel="Back to residents" onBack={props.onClose} />
      {data ? (
        <View style={[mobileSurfaces.icyCard, styles.profileCard]}>
          <View style={styles.avatar}>
            <UserRound size={30} color={colors.primary} />
          </View>
          <View style={styles.profileInfo}>
            <Text
              accessibilityRole="header"
              className="font-heading"
              numberOfLines={2}
              style={styles.profileName}
            >
              {data.displayName}
            </Text>
            <StatusDot
              status={data.status === 'current' ? 'active' : 'inactive'}
              text={
                data.status === 'current'
                  ? 'Active resident'
                  : data.status === 'former'
                    ? 'Former resident'
                    : 'No stay'
              }
            />
          </View>
        </View>
      ) : null}
      {profile.isPending ? <Skeleton kind="details" label="Loading resident…" /> : null}
      {profile.isError ? <Copy alert>{safeMessage(profile.error)}</Copy> : null}
      {data ? (
        <>
          <View style={[mobileSurfaces.icyCard, styles.card, { gap: 10 }]}>
            <InvFact Icon={Phone}>{data.contact.phone ?? 'No phone'}</InvFact>
            <InvFact Icon={Mail}>{data.contact.email ?? 'No email'}</InvFact>
            {/* CHG-054 / CHG-004: masked; only the last 4 digits ever leave the server. */}
            <InvFact Icon={IdCard}>
              {data.cnicLast4
                ? '•••••-••••' + data.cnicLast4.slice(0, 3) + '-' + data.cnicLast4.slice(3)
                : 'No CNIC'}
            </InvFact>
            <InvFact Icon={Link2}>
              {data.linked ? 'Has a customer account' : 'No customer account'}
            </InvFact>
          </View>
          <Text accessibilityRole="header" className="font-heading" style={styles.heading}>
            Stays
          </Text>
          {data.stays.length === 0 ? <Copy>No stays yet</Copy> : null}
          {[...data.stays]
            .sort((left, right) => right.moveInDate.localeCompare(left.moveInDate))
            .map((stay) => {
              const label = stateText[stay.state] ?? stay.state;
              const dates =
                day(stay.moveInDate) +
                ' → ' +
                (stay.expectedLeaveDate ? day(stay.expectedLeaveDate) : 'open-ended');
              return (
                <Pressable
                  key={stay.id}
                  accessibilityRole="button"
                  accessibilityLabel={'Stay ' + dates + ', ' + label}
                  onPress={() => {
                    setStayId(stay.id);
                    setHistoryOpen(false);
                  }}
                  style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
                >
                  <View style={[mobileSurfaces.icyCard, styles.card, styles.row]}>
                    <CalendarDays size={22} color={colors.primary} />
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text className="font-heading" numberOfLines={1} style={styles.title}>
                        {dates}
                      </Text>
                      <StatusDot status={stateDot[stay.state] ?? 'inactive'} text={label} />
                    </View>
                    <ChevronRight size={22} color={colors.primary} />
                  </View>
                </Pressable>
              );
            })}
          {data.staysTruncated ? <Copy>Showing the latest 50 stays</Copy> : null}
        </>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 16 },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.aqua,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfo: {
    flex: 1,
    gap: 8,
  },
  profileName: {
    color: colors.heading,
    fontSize: 22,
    fontWeight: '700',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heading: { color: colors.heading, fontSize: 18, fontWeight: '700' },
  title: { color: colors.heading, fontSize: 16, fontWeight: '700' },
});
