import { useRef, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import {
  ArrowLeft,
  EllipsisVertical,
  IdCard,
  Link2,
  Mail,
  MessageCircle,
  Phone,
} from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { readResidentProfile, type readStaffStay } from '@hsm/api-client';
import { mobileColors as c } from '@hsm/ui';
import { actorClient } from '../lib/runtime';
import { StayResidentPhoto } from './stay-resident-photo';
import { useOwnerScreenBack } from './owner-screen-back';
import { ResidentGlassCorners, residentStyles as s } from './resident-detail-ui';
import { ResidentActionsMenu } from './resident-actions-menu';
const states: Record<string, string> = {
  active: 'Active Resident',
  check_in_ready: 'Ready to check in',
  notice_given: 'Notice given',
  checkout_pending: 'Checkout pending',
  completed: 'Former resident',
  terminated: 'Terminated',
  abandoned: 'Abandoned',
  cancelled_before_checkin: 'Cancelled',
};
export function StaffResidentHeader(props: {
  actorId: string;
  branchId: string;
  data: Awaited<ReturnType<typeof readStaffStay>>;
  onClose: () => void;
  onHistory?: (() => void) | undefined;
  onCheckout?: (() => void) | undefined;
  onEdit?: (() => void) | undefined;
  onAgreement?: (() => void) | undefined;
}) {
  const { actorId, branchId, data } = props;
  useOwnerScreenBack(props.onClose, true, 2);
  const [menu, setMenu] = useState(false);
  const [menuTop, setMenuTop] = useState(220);
  const menuAnchor = useRef<View>(null);
  const profile = useQuery({
    queryKey: ['resident-profile', actorId, branchId, data.residentId],
    retry: false,
    gcTime: 0,
    refetchInterval: 30000,
    queryFn: async () => readResidentProfile(await actorClient(actorId), branchId, data.residentId),
  });
  const phone = data.contact.phone;
  const last4 = profile.data?.cnicLast4;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to residents"
        onPress={props.onClose}
        style={[s.row, { alignSelf: 'flex-start', minHeight: 40, paddingHorizontal: 7 }]}
      >
        <ArrowLeft size={20} color={c.primary} />
        <Text style={[s.value, { fontSize: 12, color: c.primary }]}>Back to residents</Text>
      </Pressable>
      <View accessibilityLabel="Resident identity" style={[s.card, { padding: 12 }]}>
        <ResidentGlassCorners />
        <View style={s.row}>
          <StayResidentPhoto actorId={actorId} stayId={data.id} branchId={branchId} size={62} />
          <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <Text style={[s.heading, { fontSize: 22 }]}>{data.displayName}</Text>
              <View style={[s.pill, { alignSelf: 'center' }]}>
                <View
                  style={[s.dot, data.state !== 'active' && { backgroundColor: c.secondary }]}
                />
                <Text style={[s.value, { color: c.primary, fontSize: 10 }]}>
                  {states[data.state] ?? data.state}
                </Text>
              </View>
            </View>
            <Text
              style={[s.body, { fontSize: 11 }]}
              accessibilityLabel={'Resident ID: ' + data.residentId}
            >
              {'Resident ID: ' + data.residentId.slice(0, 8) + '…'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 5 }}>
            {phone ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Call resident"
                  onPress={() => {
                    void Linking.openURL('tel:' + phone);
                  }}
                  style={s.iconButton}
                >
                  <Phone size={19} color={c.primary} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Message resident"
                  onPress={() => {
                    void Linking.openURL('sms:' + phone);
                  }}
                  style={s.iconButton}
                >
                  <MessageCircle size={19} color={c.primary} />
                </Pressable>
              </>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="More resident actions"
              accessibilityState={{ expanded: menu }}
              ref={menuAnchor}
              onPress={() => {
                menuAnchor.current?.measureInWindow((_x, y, _width, height) =>
                  setMenuTop(y + height + 8),
                );
                setMenu(true);
              }}
              style={s.iconButton}
            >
              <EllipsisVertical size={21} color={c.primary} />
            </Pressable>
          </View>
        </View>
        <View style={[s.inset, { flexDirection: 'row', gap: 10 }]}>
          <ResidentGlassCorners />
          <View
            style={{
              flex: 0.9,
              gap: 9,
              justifyContent: 'space-between',
              borderRightWidth: 1,
              borderColor: c.border,
              paddingRight: 7,
            }}
          >
            <View style={s.row}>
              <Phone size={17} color={c.primary} />
              <Text selectable style={[s.value, { flexShrink: 1, fontSize: 14 }]}>
                {phone?.replace(/^(\+92)(\d{3})(\d{7})$/, '$1 $2 $3') ?? 'No phone'}
              </Text>
            </View>
            <View style={s.row}>
              <IdCard size={17} color={c.primary} />
              <Text style={[s.value, { fontSize: 14 }]}>
                {profile.isPending
                  ? 'Loading…'
                  : profile.isError
                    ? 'CNIC unavailable'
                    : last4
                      ? 'CNIC ending ' + last4
                      : 'No CNIC'}
              </Text>
            </View>
          </View>
          <View style={{ flex: 1.1, minWidth: 0, gap: 9, justifyContent: 'space-between' }}>
            <View style={s.row}>
              <Mail size={17} color={c.primary} />
              <Text selectable numberOfLines={2} style={[s.value, { flex: 1, fontSize: 13 }]}>
                {data.contact.email ?? 'No email'}
              </Text>
            </View>
            <View style={s.row}>
              <Link2 size={17} color={c.primary} />
              <Text
                style={[
                  s.value,
                  {
                    flexShrink: 1,
                    backgroundColor: c.aqua,
                    borderRadius: 12,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    fontSize: 12,
                  },
                ]}
              >
                {profile.isPending
                  ? 'Loading…'
                  : profile.isError
                    ? 'Account unavailable'
                    : profile.data?.linked
                      ? 'Customer account linked'
                      : 'No customer account'}
              </Text>
            </View>
          </View>
        </View>
      </View>
      {menu ? (
        <ResidentActionsMenu
          top={menuTop}
          onClose={() => setMenu(false)}
          onEdit={profile.data?.linked === false ? props.onEdit : undefined}
          onHistory={props.onHistory}
          onAgreement={props.onAgreement}
          onCheckout={props.onCheckout}
        />
      ) : null}
    </>
  );
}
