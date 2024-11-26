import { Text, View } from 'react-native';
import { BadgeCheck, Clock3, PencilLine, ShieldAlert } from 'lucide-react-native';
import type { HostelOnboarding, HostelRevision } from '@hsm/contracts';
import { mobileColors as c } from '@hsm/ui';
import { safeMessage } from '../lib/messages';
import { SetupButton, SetupCard, SetupText } from './owner-wizard-ui';
import { useHostelRevision } from './use-hostel-revision';
const labels: Record<string, string> = {
  name: 'Name',
  logoFileId: 'Logo',
  category: 'Hostel type',
  description: 'About',
  phone: 'Phone',
  showPublicContact: 'Show contact',
  propertyTier: 'Property tier',
  establishmentYear: 'Year established',
  cityId: 'City',
  areaId: 'Area',
  subAreaId: 'Sub-area',
  addressLine: 'Address',
  location: 'Map pin',
  nearbyLandmark: 'Landmark',
};
// Plain list of what would change, comparing the proposal with the live hostel.
export function changedFields(live: HostelOnboarding, revision: HostelRevision) {
  const branch: Record<string, unknown> = { ...(live.mainBranch ?? {}) };
  const current: Record<string, unknown> = {
    ...branch,
    name: live.name,
    logoFileId: live.logoFileId,
  };
  const proposed: Record<string, unknown> = {
    ...(revision.changes.basics ?? {}),
    ...(revision.changes.main ?? {}),
  };
  const changed = Object.keys(proposed).filter(
    (key) =>
      key in labels &&
      JSON.stringify(proposed[key] ?? null) !== JSON.stringify(current[key] ?? null),
  );
  return [...new Set(changed.map((key) => labels[key] ?? key))];
}
// CHG-041: the approved hostel stays live; edits wait here until HSM approves them.
export function OwnerRevisionPanel(props: { actorId: string; brandId: string }) {
  const { query, command, revision, open } = useHostelRevision(props.actorId, props.brandId, true);
  if (query.isError)
    return (
      <SetupCard>
        <SetupText alert>{safeMessage(query.error)}</SetupText>
      </SetupCard>
    );
  if (!query.data) return null;
  const busy = command.isPending || command.unresolved;
  const changes = open ? changedFields(query.data.live, open) : [];
  const head = (Icon: typeof Clock3, title: string, color: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Icon color={color} size={22} />
      <Text style={{ flex: 1, color: c.heading, fontSize: 16, fontWeight: '700' }}>{title}</Text>
    </View>
  );
  return (
    <SetupCard>
      {open?.status === 'submitted' ? (
        <>
          {head(Clock3, 'Waiting for HSM review', c.primary)}
          <SetupText muted>
            Your hostel stays live with its current details until approved.
          </SetupText>
        </>
      ) : open ? (
        <>
          {head(PencilLine, 'Unsent changes', c.primary)}
          <SetupText muted>Customers still see the approved details.</SetupText>
        </>
      ) : revision?.status === 'rejected' ? (
        <>
          {head(ShieldAlert, 'Last changes not approved', c.dangerText)}
          {revision.decisionNote ? <SetupText>{revision.decisionNote}</SetupText> : null}
          <SetupText muted>Edit Basic Information or Location to try again.</SetupText>
        </>
      ) : (
        <>
          {head(
            BadgeCheck,
            revision?.status === 'approved' ? 'Changes approved' : 'Hostel is live',
            c.primary,
          )}
          <SetupText muted>
            Edit Basic Information or Location, then send the changes for re-verification.
          </SetupText>
        </>
      )}
      {changes.length ? <SetupText>Changed: {changes.join(', ')}</SetupText> : null}
      {command.isError ? <SetupText alert>{safeMessage(command.error)}</SetupText> : null}
      {command.unresolved && !command.isPending ? (
        <SetupButton label="Retry" onPress={() => command.retryOriginal()} />
      ) : null}
      {open?.status === 'draft' ? (
        <SetupButton
          label={busy ? 'Sending…' : 'Send for re-verification'}
          disabled={busy || !changes.length}
          onPress={() => command.mutate({ kind: 'submit', expectedVersion: open.version })}
        />
      ) : null}
      {open ? (
        <SetupButton
          secondary
          label={open.status === 'submitted' ? 'Withdraw changes' : 'Discard changes'}
          disabled={busy}
          onPress={() => command.mutate({ kind: 'withdraw', expectedVersion: open.version })}
        />
      ) : null}
    </SetupCard>
  );
}
