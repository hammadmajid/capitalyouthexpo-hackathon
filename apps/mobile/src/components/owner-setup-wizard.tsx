import { router, useLocalSearchParams } from 'expo-router';
import { useSession } from './providers';
import { SetupButton, SetupCard, SetupShell, SetupText } from './owner-wizard-ui';
import { OwnerSetupOverview } from './owner-setup-overview';
import { OwnerSetupStep } from './owner-setup-step';
import { parseSetupStep } from './use-owner-draft';
import { leaveSetup, setSetupBranch } from './owner-setup-nav';
// HSM-SETUP: one canonical flow over brand → primary branch drafts.
export function OwnerSetupWizard() {
  const profile = useSession().profile;
  const params = useLocalSearchParams<{
    brandId?: string;
    step?: string;
    buildingId?: string;
    floorId?: string;
    roomId?: string;
    add?: string;
    branchId?: string;
    addBranch?: string;
  }>();
  if (!profile) return null;
  if (!profile.capabilities.owner || !profile.user.emailVerified)
    return (
      <SetupShell
        title="Hostel Setup"
        subtitle="A verified Owner profile is required first."
        back={leaveSetup}
      >
        <SetupCard>
          <SetupText>
            Complete your verified Owner profile first. Identity details are never public.
          </SetupText>
          <SetupButton
            label="Complete Owner profile"
            onPress={() => router.push('/owner-profile')}
          />
        </SetupCard>
      </SetupShell>
    );
  const step = parseSetupStep(params.step),
    brandId = typeof params.brandId === 'string' && params.brandId ? params.brandId : undefined;
  // BRN-001: a branch flow always belongs to an existing hostel (brandId).
  const branch = {
    ...(brandId && typeof params.branchId === 'string' && params.branchId
      ? { branchId: params.branchId }
      : {}),
    ...(brandId && params.addBranch === '1' && !params.branchId ? { addBranch: true } : {}),
  };
  setSetupBranch(branch);
  return step ? (
    <OwnerSetupStep
      key={[
        profile.user.id,
        brandId,
        branch.branchId ?? (branch.addBranch ? 'add' : 'main'),
        step,
        params.buildingId,
        params.floorId,
        params.roomId,
      ].join(':')}
      level={{
        ...(typeof params.buildingId === 'string' ? { buildingId: params.buildingId } : {}),
        ...(typeof params.floorId === 'string' ? { floorId: params.floorId } : {}),
        ...(typeof params.roomId === 'string' ? { roomId: params.roomId } : {}),
        ...(params.add === 'building' ||
        params.add === 'floor' ||
        params.add === 'room' ||
        params.add === 'bed'
          ? { add: params.add }
          : {}),
      }}
      actorId={profile.user.id}
      brandId={brandId}
      branch={branch}
      step={step}
    />
  ) : (
    <OwnerSetupOverview
      key={[profile.user.id, brandId ?? 'new', branch.branchId ?? String(branch.addBranch)].join(
        ':',
      )}
      actorId={profile.user.id}
      brandId={brandId}
      branch={branch}
    />
  );
}
