import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { BedDouble, ChevronRight } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import type { ResidentDirectoryPage, ResidentDirectoryQuery } from '@hsm/contracts';
import { readResidentDirectory } from '@hsm/api-client';
import { mobileColors as colors, mobileSurfaces } from '@hsm/ui';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { AppHeader } from './navigation/header';
import { Skeleton } from './loading/skeleton';
import { FilterChip, StatusDot } from './inventory-tools';
import { Button, Copy } from './ui';
import { ResidentProfile } from './resident-profile';
import { ResidentLinkRequests } from './resident-link-requests';
type Status = NonNullable<ResidentDirectoryQuery['status']>;
type Row = ResidentDirectoryPage['data'][number];
const chips: [Status, string][] = [
  ['current', 'Living here'],
  ['former', 'Left'],
  ['none', 'No stay'],
];
// The person's situation in one short phrase (CURRENT_STAY_STATES on the server).
function situation(row: Row) {
  if (row.status === 'former') return { status: 'inactive', text: 'Left' };
  if (row.status === 'none') return { status: 'inactive', text: 'No stay' };
  const state = row.currentStay?.state;
  if (state === 'notice_given') return { status: 'reserved', text: 'Notice given' };
  if (state === 'checkout_pending') return { status: 'blocked', text: 'Checking out' };
  return { status: 'active', text: 'Living here' };
}
// RES-004 / CHG-048: the Residents tab is one list of people (search, live filters) whose
// page shows contact details and every stay. Adding residents happens on a vacant bed in
// Rooms & rent. The parent mounts this only for stay_manage; the server rechecks each read.
export function NativeResidentDirectory({
  actorId,
  branchId,
  initialBilling,
  initialMonth,
  canFinance = false,
}: {
  actorId: string;
  branchId: string;
  initialBilling?: 'due' | 'overdue';
  initialMonth?: string;
  canFinance?: boolean;
}) {
  const [draft, setDraft] = useState(''),
    [q, setQ] = useState(''),
    [status, setStatus] = useState<Status>(),
    [billing, setBilling] = useState<'due' | 'overdue' | undefined>(initialBilling),
    [billingMonth, setBillingMonth] = useState(initialMonth ?? ''),
    [monthDraft, setMonthDraft] = useState(initialMonth ?? ''),
    [cursor, setCursor] = useState<string>(),
    [selected, setSelected] = useState<string>();
  const read = async (query: Record<string, unknown>) =>
    readResidentDirectory(await actorClient(actorId), branchId, query);
  const page = useQuery({
    queryKey: ['resident-directory', actorId, branchId, q, status, billing, billingMonth, cursor],
    gcTime: 0,
    retry: false,
    queryFn: () =>
      read({
        limit: 20,
        ...(q ? { q } : {}),
        ...(status ? { status } : {}),
        ...(billing ? { billing } : {}),
        ...(billing === 'due' && billingMonth ? { month: billingMonth } : {}),
        ...(cursor ? { cursor } : {}),
      }),
  });
  // A filter shows only when it has at least one person (one-row probes per status).
  const present = useQuery({
    queryKey: ['resident-directory', actorId, branchId, 'present'],
    gcTime: 0,
    retry: false,
    queryFn: async () => {
      const found = await Promise.all(
        chips.map(async ([value]) =>
          (await read({ limit: 1, status: value })).data.length ? value : null,
        ),
      );
      return found.filter((value): value is Status => value !== null);
    },
  });
  if (selected)
    return (
      <ResidentProfile
        actorId={actorId}
        branchId={branchId}
        residentId={selected}
        onClose={() => setSelected(undefined)}
      />
    );
  const visible = chips.filter(([value]) => value === status || present.data?.includes(value));
  return (
    <View className="gap-3" accessibilityLabel="Residents">
      <AppHeader
        title="Residents"
        showBack={false}
        search={{
          label: 'Search residents by name',
          value: draft,
          onChange: setDraft,
          maxLength: 100,
          submitLabel: 'Search residents',
          onSubmit: () => {
            setQ(draft.trim());
            setCursor(undefined);
          },
        }}
      />
      <ResidentLinkRequests key={actorId + ':' + branchId} actorId={actorId} branchId={branchId} />
      {canFinance ? (
        <View className="flex-row flex-wrap gap-2">
          {(
            [
              ['all', 'All billing'],
              ['due', 'Due amount'],
              ['overdue', 'Overdue'],
            ] as const
          ).map(([key, text]) => (
            <FilterChip
              key={key}
              text={text}
              label={'Filter residents: ' + text}
              selected={key === (billing ?? 'all')}
              onPress={() => {
                setBilling(key === 'all' ? undefined : key);
                setCursor(undefined);
              }}
            />
          ))}
          {billing === 'due' ? (
            <TextInput
              accessibilityLabel="Invoice month"
              placeholder="YYYY-MM (current)"
              value={monthDraft}
              maxLength={7}
              onChangeText={setMonthDraft}
              onEndEditing={() => {
                if (monthDraft === '' || /^\d{4}-(0[1-9]|1[0-2])$/.test(monthDraft)) {
                  setBillingMonth(monthDraft);
                  setCursor(undefined);
                }
              }}
              style={{
                color: colors.heading,
                backgroundColor: colors.surface,
                borderRadius: 12,
                padding: 10,
                minWidth: 130,
              }}
            />
          ) : null}
        </View>
      ) : null}
      {visible.length > 1 || status ? (
        <View className="flex-row flex-wrap gap-2">
          <FilterChip
            text="All"
            label="Show all residents"
            selected={!status}
            onPress={() => {
              setStatus(undefined);
              setCursor(undefined);
            }}
          />
          {visible.map(([value, text]) => (
            <FilterChip
              key={value}
              text={text}
              label={'Show ' + text.toLowerCase()}
              selected={status === value}
              onPress={() => {
                setStatus(status === value ? undefined : value);
                setCursor(undefined);
              }}
            />
          ))}
        </View>
      ) : null}
      {page.isPending ? <Skeleton kind="list" label="Loading residents…" /> : null}
      {page.isError ? <Copy alert>{safeMessage(page.error)}</Copy> : null}
      {page.data?.data.length === 0 ? (
        <Copy>
          {q
            ? 'No one matches this name'
            : billing
              ? 'No residents match this billing filter'
              : 'No residents yet'}
        </Copy>
      ) : null}
      {page.data?.data.map((row) => (
        <ResidentRow key={row.id} row={row} onPress={() => setSelected(row.id)} />
      ))}
      {page.data?.nextCursor ? (
        <Button
          secondary
          label="Next residents"
          onPress={() => setCursor(page.data.nextCursor ?? undefined)}
        />
      ) : null}
      {cursor ? (
        <Button secondary label="First residents" onPress={() => setCursor(undefined)} />
      ) : null}
    </View>
  );
}
function ResidentRow({ row, onPress }: { row: Row; onPress: () => void }) {
  const now = situation(row);
  const place = row.currentStay?.roomLabel
    ? 'Room ' +
      row.currentStay.roomLabel +
      (row.currentStay.bedLabel ? ' · Bed ' + row.currentStay.bedLabel : '')
    : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={row.displayName + ', ' + now.text + (place ? ', ' + place : '')}
      onPress={onPress}
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <View style={[mobileSurfaces.icyCard, styles.card]}>
        <View style={{ flex: 1, gap: 6 }}>
          <View style={styles.top}>
            <Text className="font-heading" numberOfLines={1} style={styles.name}>
              {row.displayName}
            </Text>
            <StatusDot status={now.status} text={now.text} />
          </View>
          {place ? (
            <View style={styles.top}>
              <BedDouble size={18} color={colors.secondary} />
              <Text className="font-body" numberOfLines={1} style={styles.place}>
                {place}
              </Text>
            </View>
          ) : null}
        </View>
        <ChevronRight size={22} color={colors.primary} />
      </View>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flexShrink: 1, color: colors.heading, fontSize: 17, fontWeight: '700' },
  place: { flexShrink: 1, color: colors.text, fontSize: 15 },
});
