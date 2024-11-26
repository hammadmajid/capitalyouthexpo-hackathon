import { View } from 'react-native';
import { router } from 'expo-router';
import { BarChart3, BedDouble, UserPlus } from 'lucide-react-native';
import { Skeleton } from './loading/skeleton';
import { safeMessage } from '../lib/messages';
import { QuickAction, SectionTitle, ownerGrid } from './owner-ui';
import { SetupCard, SetupText } from './owner-wizard-ui';
import { editableStatuses } from './use-owner-draft';
import { OwnerAttentionPanel } from './owner-attention-panel';
import { OwnerDraftResume } from './owner-draft-resume';
import { DashboardCollections, DashboardOccupancy, DashboardDues } from './owner-dashboard-cards';
import { OwnerIncomeTrend } from './owner-income-trend';
export { shiftMonth } from './owner-month';
import type { OwnerHomeData } from './use-owner-home';
export function OwnerDashboardActive({
  actorId,
  home,
  branchId,
  setMonth,
}: {
  actorId: string;
  home: OwnerHomeData;
  branchId?: string | undefined;
  month?: string | undefined;
  setMonth?: ((month: string | undefined) => void) | undefined;
  currentMonth?: string | undefined;
}) {
  const hostels = home.hostels.data ?? [];
  const branches = home.branches.data?.data ?? [];
  const dashboard = home.dashboard.data;
  const totals = dashboard?.totals;
  const visibleHostels = branchId
    ? hostels.filter((hostel) =>
        branches.some((branch) => branch.id === branchId && branch.brandId === hostel.id),
      )
    : hostels;
  const firstHostel = visibleHostels[0];
  const firstBranch = branchId
    ? branches.find((row) => row.id === branchId)
    : (branches.find((row) => row.brandId === firstHostel?.id) ?? branches[0]);
  const editableHostel = visibleHostels.find((hostel) => {
    const branch = branches.find((row) => row.brandId === hostel.id);
    return !branch || editableStatuses.includes(branch.verificationStatus);
  });
  // CHG-041: rooms are edited in Hostel Setup, also once the hostel is approved and live.
  const roomsHostel =
    editableHostel ??
    visibleHostels.find(
      (hostel) =>
        branches.find((row) => row.brandId === hostel.id)?.verificationStatus === 'approved',
    );
  const open = (tool: string) =>
    router.push({
      pathname: '/owner-branch',
      params: {
        ...(branchId
          ? { branchId }
          : branches.length === 1 && firstBranch
            ? { branchId: firstBranch.id }
            : {}),
        tool,
        ...(dashboard?.month ? { month: dashboard.month } : {}),
      },
    });
  return (
    <>
      {home.dashboard.isError ? (
        <SetupCard>
          <SetupText alert>{safeMessage(home.dashboard.error)}</SetupText>
        </SetupCard>
      ) : !totals || !dashboard ? (
        <Skeleton kind="dashboard" label="Loading dashboard figures…" />
      ) : (
        <>
          <DashboardCollections dashboard={dashboard} open={open} />
          <OwnerIncomeTrend
            key={dashboard.month}
            points={dashboard.totals.details?.trend ?? []}
            onChooseMonth={setMonth}
          />
          <DashboardOccupancy dashboard={dashboard} />
          <DashboardDues dashboard={dashboard} open={open} />
          <OwnerAttentionPanel dashboard={dashboard} />
        </>
      )}
      <SectionTitle>Quick Actions</SectionTitle>
      <View style={ownerGrid}>
        <QuickAction
          glass
          label="Rooms & Beds"
          description="Buildings, floors, rooms"
          Icon={BedDouble}
          disabled={!firstHostel}
          onPress={() =>
            roomsHostel
              ? router.push({
                  pathname: '/owner-setup',
                  params: { brandId: roomsHostel.id, step: 'rooms' },
                })
              : firstBranch &&
                router.push({ pathname: '/owner-branch', params: { branchId: firstBranch.id } })
          }
        />
        <QuickAction
          glass
          label="Invite Manager"
          description={firstBranch ? 'Give branch access' : 'Needs a branch'}
          Icon={UserPlus}
          disabled={!firstBranch}
          onPress={() => router.push('/owner-invite')}
        />
        <QuickAction
          glass
          label="View Reports"
          description="Occupancy, rent, bookings"
          Icon={BarChart3}
          disabled={!firstBranch}
          onPress={() => router.push('/owner-reports')}
        />
      </View>
      {visibleHostels
        .filter((hostel) =>
          branches.some(
            (b) => b.brandId === hostel.id && editableStatuses.includes(b.verificationStatus),
          ),
        )
        .map((hostel) => (
          <OwnerDraftResume key={hostel.id} actorId={actorId} brandId={hostel.id} />
        ))}
    </>
  );
}
