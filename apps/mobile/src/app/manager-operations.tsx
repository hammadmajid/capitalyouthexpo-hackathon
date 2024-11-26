import { Redirect } from 'expo-router';
import { useSession } from '../components/providers';
import { ManagerShell } from '../components/manager-shell';
import { ManagerToolGrid } from '../components/manager-home';
import { usePickedManagerBranch } from '../lib/manager-branch';
// MGRD: the Operations tab — every branch tool for the Manager's assigned branch.
export default function ManagerOperations() {
  const profile = useSession().profile;
  const branch = usePickedManagerBranch(profile?.capabilities.managerOf ?? []);
  if (!profile) return <Redirect href="/" />;
  if (!branch) return <Redirect href="/account" />;
  return (
    <ManagerShell title="Operations" tab="operations">
      <ManagerToolGrid actorId={profile.user.id} branchId={branch.branchId} />
    </ManagerShell>
  );
}
