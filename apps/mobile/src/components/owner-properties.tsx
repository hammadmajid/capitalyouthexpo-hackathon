import { Skeleton } from './loading/skeleton';
import { router } from 'expo-router';
import { safeMessage } from '../lib/messages';
import { useSession } from './providers';
import { OwnerScreen } from './owner-screen';
import { OwnerHostelCard } from './owner-hostel-card';
import { SetupButton, SetupCard, SetupText } from './owner-wizard-ui';
import { useOwnerHome } from './use-owner-home';
// Properties: the Owner's saved hostels. The six setup steps open when adding a new hostel or
// a new branch of an existing one (BRN-001, from each hostel card).
export function OwnerProperties() {
  const profile = useSession().profile;
  if (!profile?.capabilities.owner) return null;
  return <Properties key={profile.user.id} actorId={profile.user.id} />;
}
function Properties({ actorId }: { actorId: string }) {
  const home = useOwnerHome(actorId);
  const hostels = home.hostels.data ?? [];
  const branches = home.branches.data?.data ?? [];
  const rows = home.dashboard.data?.branches ?? [];
  return (
    <OwnerScreen title="Properties">
      <SetupButton label="Add hostel" onPress={() => router.push('/owner-setup')} />
      {home.error ? (
        <SetupCard>
          <SetupText alert>{safeMessage(home.error)}</SetupText>
        </SetupCard>
      ) : home.loading ? (
        <Skeleton kind="list" label="Loading your hostels…" />
      ) : !hostels.length ? (
        <SetupCard>
          <SetupText>No hostels yet</SetupText>
        </SetupCard>
      ) : null}
      {hostels.map((hostel) => {
        const own = branches.filter((row) => row.brandId === hostel.id);
        return (
          <OwnerHostelCard
            key={hostel.id}
            actorId={actorId}
            hostel={hostel}
            branches={own}
            rows={rows.filter((row) => own.some((branch) => branch.id === row.branchId))}
          />
        );
      })}
    </OwnerScreen>
  );
}
