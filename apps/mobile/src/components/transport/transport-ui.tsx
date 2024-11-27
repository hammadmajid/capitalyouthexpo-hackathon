import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Bus,
  CheckCircle2,
  Flag,
  GraduationCap,
  MapPin,
  Wallet,
  type LucideIcon,
} from 'lucide-react-native';
import { marketplacePrice } from '@hsm/api-client';
import type { TransportRoute, TransportTrip } from '@hsm/contracts';
import { mobileColors as c, mobileSurfaces } from '@hsm/ui';
import { formatTime } from '../time-field';
// CHG-042: one way of showing a route everywhere (customer listing, resident, staff).
export const dayShort = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const kinds: Record<
  TransportRoute['destinations'][number]['kind'],
  { label: string; Icon: LucideIcon }
> = {
  university: { label: 'University', Icon: GraduationCap },
  office: { label: 'Office', Icon: Briefcase },
  area: { label: 'Area', Icon: MapPin },
  other: { label: 'Other', Icon: Flag },
};
// [1,2,3,4,5] → "Mon–Fri"; [1,3] → "Mon, Wed"; all seven → "Every day".
export function formatDays(days: number[]) {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 7) return 'Every day';
  const runs: string[] = [];
  let start = sorted[0];
  for (let index = 0; index < sorted.length; index += 1) {
    const day = sorted[index] ?? 1;
    const next = sorted[index + 1];
    if (next === day + 1) continue;
    const first = start ?? day;
    const name = (value: number) => dayShort[value - 1] ?? '';
    runs.push(
      first === day
        ? name(day)
        : day - first === 1
          ? name(first) + ', ' + name(day)
          : name(first) + '–' + name(day),
    );
    start = next;
  }
  return runs.join(', ');
}
const at = (clock: string | null, nextDay: boolean) =>
  clock ? formatTime(clock) + (nextDay ? ' (next day)' : '') : null;
export function tripParts(trip: TransportTrip) {
  const out = [
    formatTime(trip.outboundDeparts),
    at(trip.outboundArrives, trip.outboundArrivesNextDay),
  ]
    .filter(Boolean)
    .join(' – ');
  const back = trip.returnDeparts
    ? [
        at(trip.returnDeparts, trip.returnDepartsNextDay),
        at(trip.returnArrives, trip.returnArrivesNextDay),
      ]
        .filter(Boolean)
        .join(' – ')
    : null;
  return { out, back };
}
export function priceLabel(route: Pick<TransportRoute, 'pricingMode' | 'monthlyChargePaisa'>) {
  return route.pricingMode === 'included'
    ? 'Included in rent'
    : marketplacePrice(route.monthlyChargePaisa) + '/month';
}
export function TransportCard({ children }: { children: ReactNode }) {
  return (
    <View
      style={mobileSurfaces.icyCard}
      className="gap-2 rounded-card border border-cardBorder p-4 frosted-card"
    >
      {children}
    </View>
  );
}
export function RouteSummary({
  route,
  right,
  hidePrice,
}: {
  route: TransportRoute;
  right?: ReactNode;
  hidePrice?: boolean;
}) {
  const included = route.pricingMode === 'included' || route.residentInclusion === 'included';
  const showPrice = !hidePrice && (included || route.monthlyChargePaisa > 0);
  const PriceIcon = included ? CheckCircle2 : Wallet;
  const trips = route.trips.filter((trip) => trip.active);
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Bus color={c.primary} size={22} />
        <Text
          style={{ flex: 1, color: c.heading, fontSize: 16, fontWeight: '700' }}
          numberOfLines={2}
        >
          {route.name}
        </Text>
        {right}
      </View>
      {showPrice || route.status === 'inactive' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {showPrice ? (
            <>
              <PriceIcon color={c.primary} size={16} />
              <Text style={{ color: c.primary, fontWeight: '700' }}>
                {included ? 'Included in rent' : priceLabel(route)}
              </Text>
            </>
          ) : null}
          {route.status === 'inactive' ? (
            <Text style={{ color: c.secondary, fontSize: 12 }}> · Inactive</Text>
          ) : null}
        </View>
      ) : null}
      {route.destinations.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {route.destinations.map((item, index) => {
            const { Icon } = kinds[item.kind];
            return (
              <View
                key={index + item.name}
                accessibilityLabel={kinds[item.kind].label + ': ' + item.name}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: c.border,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                }}
              >
                <Icon color={c.primary} size={14} />
                <Text style={{ color: c.text, fontSize: 13 }}>{item.name}</Text>
              </View>
            );
          })}
        </View>
      ) : null}
      {route.stopPoints.length ? (
        <Text style={{ color: c.secondary, fontSize: 13 }}>
          Stops:{' '}
          {route.stopPoints
            .map(
              (stop) =>
                stop.name +
                (stop.role === 'both' ? '' : stop.role === 'pickup' ? ' (pick-up)' : ' (drop-off)'),
            )
            .join(' → ')}
        </Text>
      ) : null}
      {trips.length ? (
        trips.map((trip, index) => {
          const parts = tripParts(trip);
          return (
            <View key={index} style={{ gap: 2 }} accessibilityLabel={'Timing ' + (index + 1)}>
              <Text style={{ color: c.heading, fontWeight: '600', fontSize: 13 }}>
                {formatDays(trip.days)}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <ArrowRight color={c.primary} size={14} />
                <Text style={{ color: c.text, fontSize: 13 }}>{'Leaves hostel ' + parts.out}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <ArrowLeft color={parts.back ? c.primary : c.secondary} size={14} />
                <Text style={{ color: parts.back ? c.text : c.secondary, fontSize: 13 }}>
                  {parts.back ? 'Back pickup ' + parts.back : 'One way'}
                </Text>
              </View>
            </View>
          );
        })
      ) : route.departureTimes.length ? (
        <Text style={{ color: c.text, fontSize: 13 }}>
          Departs {route.departureTimes.map(formatTime).join(', ')}
        </Text>
      ) : null}
    </View>
  );
}
