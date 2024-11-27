import { FilterPanel } from './management-ui';
import { useState } from 'react';
import { Text } from 'react-native';
import { router } from 'expo-router';
import {
  BedDouble,
  Building2,
  CalendarCheck,
  ClipboardCheck,
  Eye,
  Info,
  Megaphone,
  MessageSquare,
  MessagesSquare,
  ShieldCheck,
  Star,
  Timer,
  UserPlus,
  UserRound,
  Users,
} from 'lucide-react-native';
import { readPlatformOverview } from '@hsm/api-client';
import { platformAnalyticsQuerySchema } from '@hsm/contracts';
import { useStaffRecord } from './staff-data';
import { AdminHeading } from './ui';
import { StaffPage, ReadState, sentence } from './staff-ui';
import { Copy } from '../ui';
import { StatGrid } from './admin-grid';
import { DateField } from '../date-field';
import { ActionButton, Fact, pkTime } from './admin-list';
function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
}
// HMA-017: authoritative counts only; uncollected measures are named, never estimated.
export function PlatformInsights() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [range, setRange] = useState({ from, to });
  const [invalid, setInvalid] = useState(false);
  const query = useStaffRecord('platform-overview', JSON.stringify(range), (c) =>
    readPlatformOverview(c, range),
  );
  const d = query.record;
  return (
    <StaffPage title="Analytics">
      <FilterPanel>
        <DateField label="From" value={from} onChange={setFrom} minYear={2024} />
        <DateField label="To" value={to} onChange={setTo} minYear={2024} />
        <ActionButton
          icon={CalendarCheck}
          text="Apply"
          label="Apply analytics dates"
          tone="solid"
          onPress={() => {
            const p = platformAnalyticsQuerySchema.safeParse({ from, to });
            setInvalid(!p.success);
            if (p.success) setRange(p.data);
          }}
        />
        {invalid ? <Copy alert>Enter valid dates with From on or before To.</Copy> : null}
      </FilterPanel>
      <ReadState query={query} />
      {d ? (
        <>
          <AdminHeading>Pending</AdminHeading>
          <StatGrid
            stats={[
              {
                label: 'Verifications',
                value: d.snapshot.verificationPending,
                icon: ClipboardCheck,
                a11y: 'Open verification queue',
                onPress: () => router.push('/admin/verifications'),
              },
              {
                label: 'Support tickets',
                value: d.snapshot.supportPending,
                icon: MessagesSquare,
                a11y: 'Open support queue',
                onPress: () => router.push('/admin/support'),
              },
              {
                label: 'Moderation reports',
                value: d.snapshot.moderationPending,
                icon: Star,
                a11y: 'Open moderation queue',
                onPress: () => router.push('/admin/moderation'),
              },
            ]}
          />
          <AdminHeading>Current platform snapshot</AdminHeading>
          <StatGrid
            stats={[
              { label: 'Registered users', value: d.snapshot.users, icon: Users },
              { label: 'Customers', value: d.snapshot.customers, icon: UserRound },
              { label: 'Owners', value: d.snapshot.owners, icon: UserRound },
              { label: 'Active branches', value: d.snapshot.activeBranches, icon: Building2 },
              { label: 'Published listings', value: d.snapshot.publishedListings, icon: Eye },
              { label: 'Active Managers', value: d.snapshot.activeManagers, icon: ShieldCheck },
            ]}
          />
          <Fact icon={Megaphone}>
            {d.snapshot.announcements.scheduled} scheduled · {d.snapshot.announcements.sent} sent ·{' '}
            {d.snapshot.announcements.cancelled} cancelled
          </Fact>
          <AdminHeading>{d.from === d.to ? d.from : d.from + ' – ' + d.to}</AdminHeading>
          <StatGrid
            stats={[
              { label: 'New users', value: d.window.registeredUsers, icon: UserPlus },
              { label: 'Bookings', value: d.window.bookingRequests, icon: BedDouble },
              { label: 'Conversations', value: d.window.conversations, icon: MessageSquare },
              { label: 'Visits', value: d.window.visitRequests, icon: Eye },
              { label: 'Check-ins', value: d.window.checkedIn, icon: CalendarCheck },
              {
                label: 'Avg. response',
                value:
                  d.window.averageResponseHours === null
                    ? undefined
                    : d.window.averageResponseHours.toFixed(1) + ' h',
                icon: Timer,
              },
            ]}
          />
          <Fact icon={Timer}>
            {d.window.respondedRequests} first decisions · {d.window.slowResponses} slow
          </Fact>
          {d.window.bookingStates.length ? (
            <Fact icon={BedDouble}>
              {d.window.bookingStates
                .map((row) => sentence(row.state) + ' ' + row.count)
                .join(' · ')}
            </Fact>
          ) : null}
          <Fact icon={Info}>Searches, listing views and revenue are not tracked.</Fact>
          <Text className="font-body text-xs text-secondary">Updated {pkTime(d.generatedAt)}</Text>
        </>
      ) : null}
    </StaffPage>
  );
}
