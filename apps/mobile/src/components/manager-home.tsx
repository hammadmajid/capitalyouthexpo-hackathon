import { Skeleton } from './loading/skeleton';
import { pickManagerBranch, usePickedManagerBranch } from '../lib/manager-branch';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  BedDouble,
  Bell,
  CalendarCheck,
  CalendarDays,
  CreditCard,
  LogOut,
  MessageCircle,
  Wallet,
} from 'lucide-react-native';
import { marketplacePrice, readBranchDashboard, readInventoryAccess } from '@hsm/api-client';
import { mobileOwnerColors as c, mobileSurfaces, ownerMetrics as m } from '@hsm/ui';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { useSession } from './providers';
import { MetricTile, QuickAction, SectionTitle, ownerGrid } from './owner-ui';
import { InfoRow, SetupButton, SetupCard, SetupText, StatusChip } from './owner-wizard-ui';
import { visibleSections } from './manager-sections';
import { ManagerShell } from './manager-shell';
// MGRD-001..005: the assigned branch only. Every figure comes from the server's branch
// dashboard; money appears only when the server includes it (live finance_view grant).
const actions = [
  {
    key: 'pendingBookings',
    label: 'Bookings',
    Icon: CalendarDays,
    tool: 'bookings',
    color: c.blueSoft,
  },
  {
    key: 'pendingProofs',
    label: 'Payment proofs',
    Icon: CreditCard,
    tool: 'inventory',
    color: c.dangerSoft,
  },
  {
    key: 'overdueInvoices',
    label: 'Overdue rent',
    Icon: Wallet,
    tool: 'inventory',
    color: c.warningSoft,
  },
  {
    key: 'openComplaints',
    label: 'Complaints',
    Icon: MessageCircle,
    tool: 'services',
    color: c.primarySoft,
  },
  { key: 'upcomingCheckouts', label: 'Checkouts', Icon: LogOut, tool: 'stays', color: c.inactive },
] as const;
function openTool(branchId: string, tool: string) {
  router.push({ pathname: '/manager-branch', params: { branchId, tool } });
}
export function ManagerHome() {
  const profile = useSession().profile;
  const branches = profile?.capabilities.managerOf ?? [];
  const branch = usePickedManagerBranch(branches);
  if (!profile) return null;
  const initial = profile.user.fullName?.trim().charAt(0).toUpperCase() || 'M';
  return (
    <ManagerShell tab="dashboard">
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" className="font-heading" style={styles.title}>
            Manager
          </Text>
          {branch ? (
            <Text className="font-body" style={styles.branch} numberOfLines={1}>
              {branch.branchName}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          onPress={() => router.push('/owner-notifications')}
          style={styles.icon}
        >
          <Bell size={m.stepIcon} color={c.heading} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open account"
          onPress={() => router.push('/account')}
          style={[styles.icon, { backgroundColor: c.primary }]}
        >
          <Text className="font-heading" style={styles.avatar}>
            {initial}
          </Text>
        </Pressable>
      </View>
      {branches.length > 1 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {branches.map((row) => {
            const on = row.branchId === branch?.branchId;
            return (
              <Pressable
                key={row.branchId}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={row.branchName}
                onPress={() => pickManagerBranch(row.branchId)}
                className={
                  'min-h-10 justify-center rounded-pill border px-4 ' +
                  (on ? 'border-primary bg-primary' : 'border-border bg-icy')
                }
              >
                <Text className={'font-heading text-sm ' + (on ? 'text-surface' : 'text-primary')}>
                  {row.branchName}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {branch ? (
        <BranchHome key={branch.branchId} actorId={profile.user.id} branchId={branch.branchId} />
      ) : (
        <SetupCard>
          <SetupText>No branch assigned yet</SetupText>
        </SetupCard>
      )}
    </ManagerShell>
  );
}
// The branch tools a Manager can open (Home and the Operations tab).
export function ManagerToolGrid({ actorId, branchId }: { actorId: string; branchId: string }) {
  const access = useQuery({
    queryKey: ['inventory-access', actorId, branchId],
    retry: false,
    queryFn: async () => readInventoryAccess(await actorClient(actorId), branchId),
  });
  return (
    <View style={ownerGrid}>
      {visibleSections(access.data?.permissions).map((section) => (
        <QuickAction
          key={section.key}
          label={section.label}
          Icon={section.Icon}
          onPress={() => openTool(branchId, section.key)}
        />
      ))}
    </View>
  );
}
function BranchHome({ actorId, branchId }: { actorId: string; branchId: string }) {
  const dash = useQuery({
    queryKey: ['branch-dashboard', actorId, branchId],
    gcTime: 0,
    retry: false,
    queryFn: async () => readBranchDashboard(await actorClient(actorId), branchId),
  });
  const d = dash.data;
  const pending = d ? Object.values(d.queue).reduce((sum, value) => sum + value, 0) : 0;
  return (
    <>
      {dash.isError ? (
        <SetupCard>
          <SetupText alert>{safeMessage(dash.error)}</SetupText>
          <SetupButton label="Try again" onPress={() => void dash.refetch()} />
        </SetupCard>
      ) : !d ? (
        <Skeleton kind="dashboard" label="Loading branch…" />
      ) : (
        <>
          <SetupCard>
            <SectionTitle
              action={
                <StatusChip
                  label={pending ? pending + ' pending' : 'All clear'}
                  tone={pending ? 'warning' : 'success'}
                />
              }
            >
              Actions Required
            </SectionTitle>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
              {actions.map(({ key, label, Icon, tool, color }) => (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={label + ': ' + d.queue[key]}
                  accessibilityState={{ disabled: d.queue[key] === 0 }}
                  disabled={d.queue[key] === 0}
                  onPress={() => openTool(branchId, tool)}
                  style={[styles.action, { backgroundColor: color }]}
                >
                  <Icon size={m.stepIcon} color={c.primaryStrong} />
                  <Text className="font-heading" style={styles.count}>
                    {d.queue[key]}
                  </Text>
                  <Text className="font-body" style={styles.actionLabel} numberOfLines={2}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </SetupCard>
          <View style={ownerGrid}>
            <MetricTile
              label="Today"
              value={String(d.today.moveIns + d.today.checkouts + d.today.visits)}
              note={
                d.today.moveIns +
                ' in · ' +
                d.today.checkouts +
                ' out · ' +
                d.today.visits +
                ' visits'
              }
              Icon={CalendarCheck}
            />
            <MetricTile
              label="Beds"
              value={String(d.beds.beds)}
              note={d.beds.occupied + ' occupied · ' + d.beds.available + ' free'}
              Icon={BedDouble}
            />
          </View>
          {/* MGRD-003: shown only when the server includes money (finance_view). */}
          {d.rent ? (
            <SetupCard>
              <SectionTitle>Rent this month</SectionTitle>
              <InfoRow label="Collected" value={marketplacePrice(d.rent.collectedPaisa)} />
              <InfoRow label="Outstanding" value={marketplacePrice(d.rent.outstandingPaisa)} />
              <InfoRow label="Overdue bills" value={String(d.rent.overdueInvoices)} />
            </SetupCard>
          ) : null}
        </>
      )}
      <SectionTitle>Branch</SectionTitle>
      <ManagerToolGrid actorId={actorId} branchId={branchId} />
    </>
  );
}
const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: c.heading, fontSize: m.title + 2 },
  branch: { color: c.secondary, fontSize: m.body },
  icon: {
    width: m.touch - 4,
    height: m.touch - 4,
    borderRadius: m.touch,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    borderColor: c.border,
  },
  avatar: { color: c.onPrimary, fontSize: m.title - 2 },
  action: {
    ...mobileSurfaces.glassEdge,
    borderWidth: 1,
    borderColor: mobileSurfaces.icyCard.borderColor,
    flexBasis: '30%',
    flexGrow: 1,
    minHeight: 96,
    borderRadius: m.inputRadius,
    padding: 9,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  count: { color: c.heading, fontSize: m.title - 2 },
  actionLabel: { color: c.secondary, fontSize: m.small, textAlign: 'center' },
});
