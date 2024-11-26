import { Redirect, useLocalSearchParams } from 'expo-router';
import { useSession } from '../components/providers';
import { BranchPanels, Branches } from '../components/branches';
import { OwnerScreen } from '../components/owner-screen';
export default function OwnerBranch() {
  const profile = useSession().profile;
  const { branchId, tool, month } = useLocalSearchParams<{
    branchId?: string;
    tool?: string;
    month?: string;
  }>();
  // Owner access removed (or signed out): go home instead of a blank screen.
  if (!profile?.capabilities.owner) return <Redirect href="/" />;
  return (
    <OwnerScreen title="Branch Operations" dense>
      {typeof branchId === 'string' && branchId ? (
        <BranchPanels
          key={branchId + ':' + (tool ?? '') + ':' + (month ?? '')}
          actorId={profile.user.id}
          branchId={branchId}
          unavailable={false}
          hideBillingPolicy
          {...(tool ? { initialSection: tool } : {})}
          {...(month ? { initialMonth: month } : {})}
        />
      ) : (
        <Branches
          context="owner"
          actorId={profile.user.id}
          {...(tool ? { initialSection: tool } : {})}
          {...(month ? { initialMonth: month } : {})}
        />
      )}
    </OwnerScreen>
  );
}
