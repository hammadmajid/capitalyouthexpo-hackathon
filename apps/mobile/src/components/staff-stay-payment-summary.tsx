import { useQuery } from '@tanstack/react-query';
import { marketplacePrice, readStaffStayRecord, readStaySettlement } from '@hsm/api-client';
import { mobileColors as c, mobileOwnerColors as owner } from '@hsm/ui';
import { nextRentLabel } from '../lib/next-rent';
import {
  ArrowRight,
  CalendarDays,
  CircleCheck,
  Clock3,
  Coins,
  Wallet,
  type LucideIcon,
} from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import { actorClient } from '../lib/runtime';
import { StaffStayRecentBills } from './staff-stay-recent-bills';
import { ResidentGlassCorners, residentStyles as s } from './resident-detail-ui';
type Props = {
  actorId: string;
  branchId: string;
  stayId: string;
  canView: boolean;
  onOpen?: (() => void) | undefined;
  moveInDate: string;
  expectedLeaveDate: string | null;
  closed: boolean;
  state: string;
};
type Metric = { label: string; value: string; Icon: LucideIcon; tone?: 'paid' | 'due' | undefined };

function FinancialMetrics({ metrics }: { metrics: Metric[] }) {
  return (
    <View
      accessibilityLabel="Payment metrics"
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
    >
      {metrics.map(({ label, value, Icon, tone }) => (
        <View
          key={label}
          accessibilityLabel={label + ': ' + value}
          style={[
            s.inset,
            {
              flexBasis: '47%',
              flexGrow: 1,
              minWidth: 0,
              minHeight: 55,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              padding: 9,
            },
          ]}
        >
          <ResidentGlassCorners />
          <Icon size={25} color={tone === 'due' ? owner.warning : c.primary} />
          <View style={{ flex: 1, gap: 5, minWidth: 0 }}>
            <Text style={[s.body, { fontSize: 12 }]}>{label}</Text>
            <View
              style={
                tone
                  ? {
                      alignSelf: 'flex-start',
                      borderRadius: 20,
                      backgroundColor: tone === 'paid' ? c.aqua : owner.dueSurface,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                    }
                  : undefined
              }
            >
              <Text
                style={[
                  s.value,
                  { fontSize: 15, color: tone === 'due' ? owner.dueText : c.heading },
                ]}
              >
                {value}
              </Text>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}
function latestRent(
  record: Awaited<ReturnType<typeof readStaffStayRecord>> | undefined,
  pending: boolean,
) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (kind: string) => parts.find((item) => item.type === kind)?.value ?? '';
  const today = part('year') + '-' + part('month') + '-' + part('day');
  const agreement = record?.agreements
    .filter((item) => item.effectiveFrom <= today)
    .sort((a, b) => b.version - a.version)[0];
  return agreement
    ? marketplacePrice(agreement.terms.rentAmountPaisa)
    : pending
      ? 'Loading…'
      : 'Unavailable';
}
export function StaffStayPaymentSummary(props: Props) {
  const financial = useQuery({
    queryKey: ['staff-stay-payment-summary', props.actorId, props.branchId, props.stayId],
    enabled: props.canView,
    retry: false,
    gcTime: 0,
    queryFn: async () =>
      readStaySettlement(await actorClient(props.actorId), props.stayId, props.branchId),
  });
  const agreements = useQuery({
    queryKey: ['staff-stay-agreed-rent', props.actorId, props.branchId, props.stayId],
    enabled: props.canView,
    retry: false,
    gcTime: 0,
    queryFn: async () =>
      readStaffStayRecord(await actorClient(props.actorId), props.branchId, props.stayId),
  });
  if (!props.canView) return null;
  const data = financial.data;
  const agreement = agreements.data?.agreements
    .filter((item) => item.effectiveFrom <= (data?.asOf ?? ''))
    .sort((a, b) => b.version - a.version)[0];
  return (
    <View accessibilityLabel="Resident payment summary" style={s.card}>
      <ResidentGlassCorners />
      <View style={s.row}>
        <Coins size={22} color={c.primary} />
        <Text style={[s.heading, { flex: 1 }]}>Payment Summary</Text>
        {props.onOpen ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View payments"
            hitSlop={8}
            onPress={props.onOpen}
            style={[s.row, { minHeight: 24, gap: 5 }]}
          >
            <Text style={[s.value, { fontSize: 10, color: c.primary }]}>View Payments</Text>
            <ArrowRight size={17} color={c.primary} />
          </Pressable>
        ) : null}
      </View>
      {financial.isPending ? <Text style={s.muted}>Loading verified balances…</Text> : null}
      {financial.isError || (!financial.isPending && !data) ? (
        <Text style={s.muted}>Financial summary unavailable.</Text>
      ) : null}
      {data ? (
        <>
          <FinancialMetrics
            metrics={[
              {
                label: 'Monthly Rent',
                value: latestRent(agreements.data, agreements.isPending),
                Icon: Wallet,
              },
              {
                label: 'Last Paid',
                value: data.lastApprovedPayment
                  ? marketplacePrice(data.lastApprovedPayment.amountPaisa)
                  : 'No payment',
                Icon: CircleCheck,
                tone: data.lastApprovedPayment ? 'paid' : undefined,
              },
              {
                label: 'Due',
                value: marketplacePrice(data.outstandingPaisa),
                Icon: Clock3,
                tone: 'due',
              },
              {
                label: 'Next Rent',
                value: nextRentLabel({ ...props, terms: agreement?.terms, asOf: data.asOf }),
                Icon: CalendarDays,
              },
            ]}
          />
          <StaffStayRecentBills invoices={data.invoices} truncated={data.invoicesTruncated} />
        </>
      ) : null}
    </View>
  );
}
