import { Skeleton } from './loading/skeleton';
import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { CircleX, KeyRound, UserMinus } from 'lucide-react-native';
import { randomUUID } from 'expo-crypto';
import { useQuery } from '@tanstack/react-query';
import { listOwnerManagers, ownerInvitationForm, ownerSetupActions } from '@hsm/api-client';
import { actorClient, client } from '../lib/runtime';
import { withFreshSession } from '../lib/fresh-session';
import { safeMessage } from '../lib/messages';
import { FlowForm } from './flow-form';
import { invitationErrorMessage } from './invitation-error';
import { IconChip } from './inventory-tools';
import { OwnerManagerReset } from './owner-manager-reset';
import { OwnerManagerRemove } from './owner-manager-remove';
import { OwnerManagerStaffAccess } from './owner-manager-staff-access';
import {
  FieldLabel,
  SetupButton,
  SetupCard,
  SetupHeading,
  SetupText,
  StatusChip,
} from './owner-wizard-ui';
type Panel = 'reset' | 'cancel';
const statusLabels = {
  pending_activation: 'Invitation pending',
  active: 'Active',
  suspended: 'Suspended',
  deactivated: 'Removed',
} as const;
// AUTH-M-003 / OWN-005: invite a manager to one branch and manage that branch's team.
// CHG-029: an activated Manager runs the whole branch; there are no permissions to pick.
export function OwnerBranchTeam({ actorId, branchId }: { actorId: string; branchId: string }) {
  const actions = useMemo(() => ownerSetupActions(client, randomUUID), []);
  useEffect(() => () => actions.forgetInvitation(branchId), [actions, branchId]);
  const [notice, setNotice] = useState<string>(),
    [open, setOpen] = useState<{ id: string; panel: Panel }>();
  const managers = useQuery({
    queryKey: ['owner-managers', actorId, branchId],
    retry: false,
    queryFn: () =>
      withFreshSession(async () =>
        listOwnerManagers(await actorClient(actorId), branchId, { limit: 50 }),
      ),
  });
  // Cancelled or removed managers leave the list entirely; their history stays in the audit log.
  const team = (managers.data?.data ?? []).filter((row) => row.status !== 'deactivated');
  const toggle = (id: string, panel: Panel) => {
    setOpen((now) => (now?.id === id && now.panel === panel ? undefined : { id, panel }));
  };
  return (
    <>
      <SetupCard>
        <SetupHeading>Invite a manager</SetupHeading>
        {/* AUTH-M-003: the Owner sets the temporary password; the app never generates one. */}
        <FlowForm
          Action={SetupButton}
          Label={FieldLabel}
          label="Send Invitation"
          formatError={invitationErrorMessage}
          fields={[
            { name: 'managerName', label: 'Full name *', maxLength: 150 },
            {
              name: 'managerPhone',
              label: 'Mobile number *',
              keyboard: 'phone-pad',
              placeholder: '03001234567',
            },
            { name: 'temporaryPassword', label: 'Temporary password *', secret: true },
          ]}
          submit={async (input) => {
            setNotice(undefined);
            const result = await actions.invite(branchId, ownerInvitationForm(input, true));
            setNotice(
              result.acceptance === 'authenticated_account'
                ? 'They already have an HSM account and accept after signing in.'
                : 'Invitation sent. Share the password with them.',
            );
            void managers.refetch();
          }}
        />
        {notice ? <SetupText>{notice}</SetupText> : null}
      </SetupCard>
      <SetupCard>
        <SetupHeading>Team</SetupHeading>
        {managers.isPending ? <Skeleton kind="list" label="Loading managers…" /> : null}
        {managers.error ? <SetupText alert>{safeMessage(managers.error)}</SetupText> : null}
        {managers.data && !team.length ? <SetupText muted>No managers yet</SetupText> : null}
        {team.map((row) => (
          <View key={row.id} style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text className="flex-1 font-heading text-body text-heading">{row.fullName}</Text>
              <StatusChip
                label={statusLabels[row.status]}
                tone={row.status === 'active' ? 'success' : 'neutral'}
              />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {/* AUTH-M-003: only a pending invitation can get a new temporary password. */}
              {row.status === 'pending_activation' ? (
                <IconChip
                  Icon={KeyRound}
                  text="New password"
                  label={'New password for ' + row.fullName}
                  onPress={() => toggle(row.id, 'reset')}
                />
              ) : null}
              {row.status === 'pending_activation' ? (
                <IconChip
                  Icon={CircleX}
                  text="Cancel invitation"
                  label={'Cancel invitation for ' + row.fullName}
                  onPress={() => toggle(row.id, 'cancel')}
                />
              ) : (
                <IconChip
                  Icon={UserMinus}
                  text="Remove"
                  label={'Remove ' + row.fullName}
                  onPress={() => toggle(row.id, 'cancel')}
                />
              )}
            </View>
            {row.status === 'active' ? (
              <OwnerManagerStaffAccess
                actorId={actorId}
                branchId={branchId}
                assignmentId={row.id}
                name={row.fullName}
              />
            ) : null}
            {open?.id === row.id && open.panel === 'cancel' ? (
              <OwnerManagerRemove
                actorId={actorId}
                branchId={branchId}
                assignment={{
                  id: row.id,
                  name: row.fullName,
                  pending: row.status === 'pending_activation',
                }}
                onClose={() => setOpen(undefined)}
                onDone={() => {
                  setOpen(undefined);
                  void managers.refetch();
                }}
              />
            ) : null}
            {open?.id === row.id && open.panel === 'reset' ? (
              <OwnerManagerReset
                branchId={branchId}
                assignment={{ id: row.id, name: row.fullName }}
                actions={actions}
              />
            ) : null}
          </View>
        ))}
      </SetupCard>
    </>
  );
}
