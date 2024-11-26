import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useSession } from '../components/providers';
import { BranchPanels } from '../components/branches';
import { OwnerScreen } from '../components/owner-screen';
import { sectionLabel } from '../components/manager-sections';
import { ManagerShell } from '../components/manager-shell';
// MGRD / SEC-001: one branch tool for a branch this Manager is assigned to; the server
// re-checks branch scope and grants on every call.
export default function ManagerBranch() {
  const profile = useSession().profile;
  const { branchId, tool, tab } = useLocalSearchParams<{
    branchId?: string;
    tool?: string;
    tab?: string;
  }>();
  if (!profile) return <Redirect href="/" />;
  const assigned = profile.capabilities.managerOf.some((row) => row.branchId === branchId);
  if (!branchId || !assigned) return <Redirect href="/manager" />;
  // The Residents tab shows the stay directory inside the tab layout (no Back).
  if (tab === 'residents')
    return (
      <ManagerShell title="Residents" tab="residents">
        <BranchPanels
          key={branchId + ':residents'}
          actorId={profile.user.id}
          branchId={branchId}
          unavailable={false}
          single
          initialSection="stays"
        />
      </ManagerShell>
    );
  return (
    <OwnerScreen
      title={sectionLabel(tool)}
      back={() => (router.canGoBack() ? router.back() : router.replace('/manager'))}
    >
      <BranchPanels
        key={branchId + ':' + (tool ?? '')}
        actorId={profile.user.id}
        branchId={branchId}
        unavailable={false}
        single
        {...(tool ? { initialSection: tool } : {})}
      />
    </OwnerScreen>
  );
}
