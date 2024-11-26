import { Skeleton } from './loading/skeleton';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Building2 } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { mobileColors, mobileOwnerColors as ownerColors } from '@hsm/ui';
const oc = ownerColors;
import { safeMessage } from '../lib/messages';
import { useSession } from './providers';
import { OwnerScreen } from './owner-screen';
import { OwnerBranchTeam } from './owner-branch-team';
import { verificationLabel, verificationTone } from './owner-status';
import { useOwnerHome } from './use-owner-home';
import { SetupButton, SetupCard, SetupHeading, SetupText, StatusChip } from './owner-wizard-ui';
// AUTH-M-003 / OWN-005: Owner-only, branch-scoped invitation; the server enforces ownership.
export function OwnerInviteManager() {
  const profile = useSession().profile;
  if (!profile?.capabilities.owner) return null;
  return <Invite key={profile.user.id} actorId={profile.user.id} />;
}
function Invite({ actorId }: { actorId: string }) {
  const home = useOwnerHome(actorId);
  const branches = home.branches.data?.data ?? [];
  const { brandId } = useLocalSearchParams<{ brandId?: string }>();
  const hostels = home.hostels.data ?? [];
  const [chosen, setChosen] = useState<string>();
  const branch =
    branches.find((row) => row.id === chosen) ??
    branches.find((row) => row.brandId === brandId) ??
    branches[0];
  return (
    <OwnerScreen title="Manager Access">
      {home.branches.isError ? (
        <SetupText alert>{safeMessage(home.branches.error)}</SetupText>
      ) : null}
      {home.loading || (home.hostels.data?.length && home.branches.isPending) ? (
        <Skeleton kind="list" label="Loading your branches…" />
      ) : !branches.length ? (
        <SetupCard>
          <SetupText>Save hostel Basic Information first.</SetupText>
          <SetupButton
            label="Create a hostel"
            onPress={() => router.push({ pathname: '/owner-setup', params: { step: 'basics' } })}
          />
        </SetupCard>
      ) : null}
      {branches.length ? (
        <SetupCard>
          <SetupHeading>Choose branch</SetupHeading>
          <View style={{ gap: 8 }}>
            {branches.map((row) => {
              const hostelName =
                hostels.find((hostel) => hostel.id === row.brandId)?.name ?? 'Hostel';
              const selected = row.id === branch?.id;
              return (
                <Pressable
                  key={row.id}
                  accessibilityRole="radio"
                  accessibilityLabel={
                    hostelName +
                    ' - ' +
                    row.name +
                    ' - ' +
                    verificationLabel(row.verificationStatus)
                  }
                  accessibilityState={{ checked: selected }}
                  onPress={() => setChosen(row.id)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    padding: 12,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: selected ? oc.primary : mobileColors.cardBorder,
                    backgroundColor: selected ? oc.primarySoft : oc.surface,
                  }}
                >
                  <Building2 size={22} color={oc.primary} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text className="font-heading" style={{ color: oc.heading }}>
                      {row.name}
                    </Text>
                    <Text className="font-body" style={{ color: oc.secondary, fontSize: 12 }}>
                      {hostelName}
                    </Text>
                  </View>
                  <StatusChip
                    label={verificationLabel(row.verificationStatus)}
                    tone={verificationTone(row.verificationStatus)}
                  />
                </Pressable>
              );
            })}
          </View>
        </SetupCard>
      ) : null}
      {branch ? <OwnerBranchTeam key={branch.id} actorId={actorId} branchId={branch.id} /> : null}
    </OwnerScreen>
  );
}
