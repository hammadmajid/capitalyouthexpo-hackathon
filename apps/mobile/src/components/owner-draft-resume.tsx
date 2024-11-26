import { router } from 'expo-router';
import { View } from 'react-native';
import { Building2 } from 'lucide-react-native';
import { mobileOwnerColors as c, ownerMetrics as m } from '@hsm/ui';
import { safeMessage } from '../lib/messages';
import { SectionTitle } from './owner-ui';
import { SetupButton, SetupCard, SetupText, StatusChip } from './owner-wizard-ui';
import {
  draftProgress,
  setupStepKeys,
  useOwnerDraftDetails,
  useOwnerHostel,
} from './use-owner-draft';

// No optimistic progress: checked only after the existing backend-backed draft queries succeed.
export function OwnerDraftResume({ actorId, brandId }: { actorId: string; brandId: string }) {
  const hostel = useOwnerHostel(actorId, brandId);
  const details = useOwnerDraftDetails(actorId, hostel.data?.mainBranch?.id);
  const status = hostel.data?.mainBranch?.verificationStatus;
  const progress = draftProgress(hostel.data, details);
  const saved = setupStepKeys.filter((key) => progress[key]).length;
  const total = setupStepKeys.length;
  const next = setupStepKeys.find((key) => !progress[key]) ?? 'review';
  return (
    <SetupCard>
      <SectionTitle>Continue Hostel Setup</SectionTitle>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Building2 size={m.heading} color={c.primary} />
        <View style={{ flex: 1 }}>
          <SetupText>{hostel.data?.name ?? 'Your saved hostel'}</SetupText>
          <StatusChip
            label={status === 'changes_requested' ? 'Changes requested' : 'Draft — incomplete'}
            tone={status === 'changes_requested' ? 'warning' : 'neutral'}
          />
        </View>
      </View>
      {hostel.isError ? <SetupText alert>{safeMessage(hostel.error)}</SetupText> : null}
      <SetupText muted>
        {saved} of {total} steps saved
      </SetupText>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: total, now: saved }}
        style={{
          height: m.progressHeight,
          borderRadius: 10,
          backgroundColor: c.inactive,
          overflow: 'hidden',
        }}
      >
        <View
          style={{ width: `${(saved * 100) / total}%`, backgroundColor: c.primary, height: '100%' }}
        />
      </View>
      <SetupButton
        label={saved === total ? 'Review submission' : 'Continue Hostel Setup'}
        disabled={!hostel.data || hostel.isError}
        onPress={() => router.push({ pathname: '/owner-setup', params: { brandId, step: next } })}
      />
      <SetupButton
        label="Invite Manager"
        secondary
        disabled={!hostel.data?.mainBranch?.id || hostel.isError}
        onPress={() => router.push({ pathname: '/owner-invite', params: { brandId } })}
      />
    </SetupCard>
  );
}
