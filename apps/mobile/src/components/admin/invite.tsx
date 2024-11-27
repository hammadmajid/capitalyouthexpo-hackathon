import { useState } from 'react';
import { inviteAdmin } from '@hsm/api-client';
import { useAdminCommand } from './data';
import { ArrowRight, Check, Mail, Send, UserCog, X } from 'lucide-react-native';
import {
  AdminCard,
  AdminError,
  AdminField,
  AdminPage,
  Roles,
  roleLabels,
  type AdminRole,
} from './ui';
import { ActionButton, ButtonRow, Fact } from './admin-list';
import { NativeCommandRecovery } from '../services/command-recovery';

export function InviteAdmin() {
  const [email, setEmail] = useState('');
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [confirm, setConfirm] = useState(false);
  const invite = useAdminCommand(
    'Admin:invite',
    (c, input: { email: string; roles: AdminRole[] }, key) => inviteAdmin(c, input, key),
    true,
  );
  const locked = invite.isPending || invite.unresolved;
  return (
    <AdminPage title="Invite Admin" backTo="/admin/admins" backDisabled={invite.isPending}>
      <NativeCommandRecovery command={invite} />
      <AdminField
        label="Existing account email"
        email
        value={email}
        disabled={locked || confirm}
        onChange={setEmail}
      />
      <Roles value={roles} disabled={locked || confirm} onChange={setRoles} />
      {invite.isError ? <AdminError error={invite.error} /> : null}
      {invite.isSuccess ? <Fact icon={Check}>Invitation sent</Fact> : null}
      {confirm ? (
        <AdminCard>
          <Fact icon={Mail}>{email.trim()}</Fact>
          <Fact icon={UserCog}>{roles.map((role) => roleLabels[role]).join(', ')}</Fact>
          <ButtonRow>
            <ActionButton
              icon={X}
              text="Cancel"
              label="Cancel invitation"
              disabled={locked}
              onPress={() => setConfirm(false)}
            />
            <ActionButton
              icon={Send}
              text="Send"
              label="Confirm Admin invitation"
              tone="solid"
              disabled={locked}
              onPress={() =>
                invite.mutate(
                  { email: email.trim(), roles },
                  {
                    onSuccess: () => {
                      setConfirm(false);
                      setEmail('');
                      setRoles([]);
                    },
                  },
                )
              }
            />
          </ButtonRow>
        </AdminCard>
      ) : (
        <ActionButton
          icon={ArrowRight}
          text="Review"
          label="Review invitation"
          tone="solid"
          disabled={locked || !email.trim() || roles.length === 0}
          onPress={() => setConfirm(true)}
        />
      )}
    </AdminPage>
  );
}
