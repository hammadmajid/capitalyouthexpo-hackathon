import { LoadingBoundary, Skeleton } from '../loading/skeleton';
import { useEffect, useState } from 'react';
import { AdminOperations } from './operations-nav';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { readPlatformOverview, readAdminExplorerSummary } from '@hsm/api-client';
import { useQuery } from '@tanstack/react-query';
import { listAdminExplorer } from '@hsm/api-client';
import { useAdminData } from './data';
import { overviewPeriods as periods, overviewStart, type OverviewPeriod } from './overview-periods';
import { HomeSnapshots } from './home-snapshots';
import { useStaffRecord } from './staff-data';
import { ReadState } from './staff-ui';
import { Copy } from '../ui';
import { IncomeCard, VerificationCard, overviewStyles as s } from './home-metrics-ui';
import { moduleAllowed } from '../../lib/admin-modules';
import { useSession } from '../providers';
import { BookOpen, CalendarCheck, Eye, UserPlus } from 'lucide-react-native';
import { StatGrid } from './admin-grid';
import { openExplorer } from './explorer-navigation';

// Order: income, Verification, Totals (now), Activity (chosen period), then Operations.
export function HomeOverview() {
  const [period, setPeriod] = useState<OverviewPeriod>('This month');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
  const data = useAdminData();
  // Activity is actor-attributed: the first retained account bounds the platform's real history.
  const lifetime = useQuery({
    queryKey: [...data.key, 'overview-lifetime-start'],
    enabled: data.active && period === 'Lifetime',
    retry: false,
    gcTime: 0,
    staleTime: Infinity,
    queryFn: ({ signal }) =>
      data.read((c) => listAdminExplorer(c, 'users', { sort: 'oldest', limit: 1 }), signal),
  });
  const earliest = lifetime.data?.data[0]?.createdAt;
  const firstDay = earliest
    ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date(earliest))
    : undefined;
  const from = overviewStart(period, today, firstDay);
  const lifetimeEmpty = period === 'Lifetime' && lifetime.isSuccess && !earliest;
  const query = useStaffRecord('home-overview', from ? from + ':' + today : '', (client) =>
    readPlatformOverview(client, { from: from ?? today, to: today }),
  );
  const snapshots = useStaffRecord('explorer-summary', 'current', readAdminExplorerSummary);
  const pairKey = JSON.stringify([...data.key, from, today]);
  const [settled, setSettled] = useState<{
    key: string;
    overview: Awaited<ReturnType<typeof readPlatformOverview>>;
    summary: Awaited<ReturnType<typeof readAdminExplorerSummary>>;
  }>();
  useEffect(() => {
    if (query.record && snapshots.record && !query.isFetching && !snapshots.isFetching)
      setSettled({ key: pairKey, overview: query.record, summary: snapshots.record });
  }, [pairKey, query.record, snapshots.record, query.isFetching, snapshots.isFetching]);
  const pair =
    settled?.key === pairKey && !query.isError && !snapshots.isError ? settled : undefined;
  const record = pair?.overview;
  const canVerify = moduleAllowed(useSession().profile, 'verification');
  const totals = snapshots.record;
  return (
    <View style={s.section}>
      <Text accessibilityRole="header" className="font-heading text-title text-heading">
        Dashboard
      </Text>
      <IncomeCard />
      {canVerify ? <VerificationCard pending={record?.snapshot.verificationPending} /> : null}
      {/* Totals are the platform as it stands now; the period below changes Activity only. */}
      <SectionHeading title="Totals" hint="All time" />
      {totals ? <HomeSnapshots summary={totals} /> : <ReadState query={snapshots} />}
      {!totals && !snapshots.isError ? <Skeleton kind="stats" label="Loading totals" /> : null}
      <SectionHeading
        title="Activity"
        hint={
          record
            ? 'Updated ' +
              new Date(record.generatedAt).toLocaleTimeString('en-PK', {
                timeZone: 'Asia/Karachi',
                hour: '2-digit',
                minute: '2-digit',
              })
            : undefined
        }
      />
      <PeriodChips period={period} setPeriod={setPeriod} />
      <LoadingBoundary
        loading={
          !record &&
          !query.isError &&
          !snapshots.isError &&
          !(period === 'Lifetime' && lifetime.isError) &&
          !lifetimeEmpty
        }
        hasContent={Boolean(record)}
        kind="dashboard"
      >
        {lifetimeEmpty ? (
          <Copy>Lifetime dates unavailable.</Copy>
        ) : period === 'Lifetime' && lifetime.isError ? (
          <ReadState query={lifetime} />
        ) : (
          <ReadState query={query} />
        )}
        {record ? (
          <StatGrid
            stats={[
              {
                label: 'Booking requests',
                value: record.window.bookingRequests,
                icon: BookOpen,
                onPress: () => openExplorer('bookings'),
              },
              { label: 'Visit requests', value: record.window.visitRequests, icon: Eye },
              { label: 'Move-ins', value: record.window.checkedIn, icon: CalendarCheck },
              { label: 'New sign-ups', value: record.window.registeredUsers, icon: UserPlus },
            ]}
          />
        ) : null}
      </LoadingBoundary>
      <AdminOperations
        {...(record
          ? {
              pending: {
                verification: record.snapshot.verificationPending,
                support: record.snapshot.supportPending,
                moderation: record.snapshot.moderationPending,
              },
            }
          : {})}
      />
    </View>
  );
}
function SectionHeading({ title, hint }: { title: string; hint?: string | undefined }) {
  return (
    <View style={s.between}>
      <Text accessibilityRole="header" className="font-heading text-body text-heading">
        {title}
      </Text>
      {hint ? <Text className="font-body text-xs text-secondary">{hint}</Text> : null}
    </View>
  );
}
function PeriodChips(props: {
  period: OverviewPeriod;
  setPeriod: (value: OverviewPeriod) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.periods}
      accessibilityLabel="Activity period"
    >
      {periods.map((value) => (
        <Pressable
          key={value}
          accessibilityRole="button"
          accessibilityLabel={value + ' analytics'}
          accessibilityState={{ selected: props.period === value }}
          onPress={() => props.setPeriod(value)}
          style={[s.period, props.period === value && s.selected]}
        >
          <Text
            className={
              props.period === value
                ? 'font-heading text-sm text-surface'
                : 'font-heading text-sm text-primary'
            }
          >
            {value}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
