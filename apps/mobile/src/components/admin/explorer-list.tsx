import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { listAdminExplorer } from '@hsm/api-client';
import { adminExplorerQuerySchema, type AdminExplorerKind } from '@hsm/contracts';
import {
  BedDouble,
  BookOpen,
  Building2,
  Database,
  Info,
  MessageSquare,
  ShieldCheck,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react-native';
import { Fact, RecordRow } from './admin-list';
const kindIcons: Record<AdminExplorerKind, LucideIcon> = {
  users: Users,
  hostels: Building2,
  branches: Building2,
  owners: UserRound,
  managers: ShieldCheck,
  bookings: BookOpen,
  occupancy: BedDouble,
  payments: Wallet,
  complaints: MessageSquare,
};
import { mobileColors as colors, icons, spacing } from '@hsm/ui';
import { useAdminData } from './data';
import { Choices, Continuation, ReadState, StaffPage } from './staff-ui';
import { FilterPanel, StatusBadge } from './management-ui';
import { Copy } from '../ui';
import { explorerTitles, openExplorerProfile } from './explorer-navigation';
import { ChatReportsEntry } from './chat-reports-entry';

export function ExplorerList({ kind, filters }: { kind: AdminExplorerKind; filters: unknown }) {
  const data = useAdminData();
  const [draft, setDraft] = useState(''),
    [q, setQuery] = useState('');
  const [notesOpen, setNotesOpen] = useState(false);
  const [period, setPeriod] = useState('lifetime'),
    [sort, setSort] = useState('newest');
  const [status, setStatus] = useState(adminExplorerQuerySchema.parse(filters).status || 'all');
  const input = adminExplorerQuerySchema.parse({
    ...adminExplorerQuerySchema.parse(filters),
    q,
    period,
    sort,
    status: status === 'all' ? '' : status,
  });
  const list = useInfiniteQuery({
    queryKey: [...data.key, 'explorer', kind, input],
    enabled: data.active,
    initialPageParam: undefined as string | undefined,
    retry: false,
    gcTime: 0,
    queryFn: ({ pageParam, signal }) =>
      data.read(
        (client) =>
          listAdminExplorer(client, kind, {
            ...input,
            ...(pageParam ? { cursor: pageParam } : {}),
          }),
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const current = !list.isError ? list.data?.pages[0] : undefined;
  const rows = current ? (list.data?.pages.flatMap((page) => page.data) ?? []) : [];
  return (
    <StaffPage
      title={explorerTitles[kind]}
      search={{
        label: 'Search name or record ID',
        value: draft,
        onChange: setDraft,
        onSubmit: () => setQuery(draft.trim()),
        submitLabel: 'Search directory',
        maxLength: 120,
      }}
    >
      {/* Chat safety reports are managed from Complaints rather than a separate tile. */}
      {kind === 'complaints' ? <ChatReportsEntry /> : null}
      {status !== 'all' ? <StatusBadge value={status} /> : null}
      <FilterPanel>
        <Choices
          label={current?.statisticsLabel ?? 'Registration / record period'}
          values={['month', 'quarter', 'year', 'lifetime']}
          value={period}
          labels={
            current
              ? {
                  month: 'This month · ' + current.statistics.month.toLocaleString('en-PK'),
                  quarter: 'This quarter · ' + current.statistics.quarter.toLocaleString('en-PK'),
                  year: 'This year · ' + current.statistics.year.toLocaleString('en-PK'),
                  lifetime: 'Lifetime · ' + current.statistics.lifetime.toLocaleString('en-PK'),
                }
              : {
                  month: 'This month',
                  quarter: 'This quarter',
                  year: 'This year',
                  lifetime: 'Lifetime',
                }
          }
          onChange={setPeriod}
        />
        <Choices
          label="Sort records"
          values={['newest', 'oldest', 'name_asc', 'name_desc']}
          value={sort}
          onChange={setSort}
        />
        <Choices
          label="Record status"
          values={[
            ...new Set([
              'all',
              ...(kind === 'branches'
                ? [
                    'pending',
                    'draft',
                    'submitted',
                    'under_review',
                    'changes_requested',
                    'approved',
                    'rejected',
                    'archived',
                  ]
                : []),
              ...(current?.statuses ?? []),
              status,
            ]),
          ]}
          value={status}
          onChange={setStatus}
        />
      </FilterPanel>
      {current ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Fact icon={Database}>
                {current.totalCount.toLocaleString('en-PK') +
                  ' records · ' +
                  new Date(current.generatedAt).toLocaleTimeString('en-PK', {
                    timeZone: 'Asia/Karachi',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
              </Fact>
              {current.quantity !== null ? (
                <Fact icon={kind === 'payments' ? Wallet : BedDouble}>
                  {current.quantity +
                    (kind === 'payments' ? ' approved payments' : ' occupied placements')}
                </Fact>
              ) : null}
              {current.amountPaisa !== null ? (
                <Fact icon={Wallet}>{paisaText(current.amountPaisa)} hostel-direct</Fact>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Data notes"
              accessibilityState={{ expanded: notesOpen }}
              onPress={() => setNotesOpen(!notesOpen)}
              style={{
                width: spacing.touch,
                height: spacing.touch,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Info color={colors.primary} size={icons.size} />
            </Pressable>
          </View>
          {notesOpen ? <Copy>{current.notice}</Copy> : null}
        </>
      ) : null}
      <ReadState query={list} empty={!rows.length} />
      <View style={{ gap: spacing.md }}>
        {rows.map((row) => (
          <RecordRow
            key={row.id}
            icon={kindIcons[kind]}
            title={row.name}
            subtitle={[
              new Date(row.createdAt).toLocaleDateString('en-PK', { timeZone: 'Asia/Karachi' }),
              row.parentName,
              row.reason,
              row.quantity !== null
                ? row.quantity + (kind === 'payments' ? ' payments' : ' placements')
                : null,
              row.amountPaisa !== null ? paisaText(row.amountPaisa) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            status={row.status}
            label={'View profile ' + row.name}
            onPress={() => openExplorerProfile(kind, row.id)}
          />
        ))}
      </View>
      <Continuation query={list} />
    </StaffPage>
  );
}
export function paisaText(value: string) {
  const amount = BigInt(value);
  return (
    'PKR ' +
    (amount / 100n).toLocaleString('en-PK') +
    '.' +
    (amount % 100n).toString().padStart(2, '0')
  );
}
