import { CalendarDays } from 'lucide-react-native';
import { Text, View } from 'react-native';
import { formatDate } from '@hsm/contracts';
import { mobileColors as c } from '@hsm/ui';
import {
  ResidentGlassCorners,
  ResidentHouseArt,
  ResidentSectionTitle,
  residentStyles as s,
} from './resident-detail-ui';
type Props = {
  moveInDate: string;
  expectedLeaveDate: string | null;
  closedAt: string | null;
  state: string;
};
const displayDay = (value: string) =>
  formatDate(value.length === 10 ? value + 'T00:00:00.000Z' : value);
export function StaffStayTimeline({ moveInDate, expectedLeaveDate, closedAt, state }: Props) {
  const departure = closedAt
    ? displayDay(closedAt)
    : expectedLeaveDate
      ? displayDay(expectedLeaveDate)
      : 'Open-ended';
  const status = closedAt
    ? 'Completed'
    : state === 'active'
      ? 'Living Here'
      : state === 'notice_given'
        ? 'Notice given'
        : state === 'checkout_pending'
          ? 'Checkout pending'
          : state.replaceAll('_', ' ');
  return (
    <View accessibilityLabel="Stay timeline" style={s.card}>
      <ResidentGlassCorners />
      <ResidentSectionTitle title="Stay" Icon={CalendarDays} />
      <View style={[s.inset, { flexDirection: 'row', gap: 10, padding: 8, overflow: 'hidden' }]}>
        <ResidentGlassCorners />
        <ResidentHouseArt />
        <View style={{ width: 15, alignItems: 'center', paddingVertical: 3 }}>
          <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: c.success }} />
          <View
            style={{
              height: 25,
              borderLeftWidth: 1,
              borderStyle: 'dashed',
              borderColor: c.success,
            }}
          />
          <View
            style={{
              width: 11,
              height: 11,
              borderRadius: 6,
              borderWidth: 1.5,
              borderColor: c.success,
            }}
          />
        </View>
        <View style={{ flex: 1, gap: 5 }}>
          <View>
            <Text style={[s.value, { lineHeight: 16 }]}>{displayDay(moveInDate)}</Text>
            <Text style={[s.body, { color: c.primary, lineHeight: 14 }]}>Check-in</Text>
          </View>
          <View>
            <Text style={[s.value, { lineHeight: 16 }]}>{departure}</Text>
            <Text style={[s.muted, { lineHeight: 14 }]}>
              {closedAt
                ? 'Checked out'
                : expectedLeaveDate
                  ? 'Expected departure'
                  : 'Stay continuing'}
            </Text>
          </View>
        </View>
        <View style={[s.pill, { alignSelf: 'flex-start' }]}>
          <View style={[s.dot, state !== 'active' && { backgroundColor: c.secondary }]} />
          <Text style={[s.body, { color: c.primary, fontSize: 10 }]}>{status}</Text>
        </View>
      </View>
    </View>
  );
}
