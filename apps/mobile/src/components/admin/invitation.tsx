import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { acceptAdminInvitation, ApiFailure, readOwnAdmin } from '@hsm/api-client';
import { useAdminData } from './data';
import { useNativeCommand } from '../services/use-command';
import { NativeCommandRecovery } from '../services/command-recovery';
import { AdminCard, AdminError, AdminHeading, AdminPage, roleLabels } from './ui';
import { Button, Copy } from '../ui';
import { Check, UserCog } from 'lucide-react-native';
import { StatusBadge } from './management-ui';
import { Fact } from './admin-list';
export function AdminInvitationEntry() {
  const data = useAdminData();
  const own = useQuery({
    queryKey: [...data.key, 'invitation'],
    enabled: data.active && !data.profile?.capabilities.admin,
    retry: false,
    gcTime: 0,
    queryFn: ({ signal }) => data.read(readOwnAdmin, signal, false),
  });
  if (own.isError || own.data?.status !== 'invited') return null;
  return (
    <Button
      secondary
      label="Review Admin invitation"
      onPress={() => router.push('/admin-invitation')}
    />
  );
}
export function AdminInvitationScreen() {
  const data = useAdminData();
  const own = useQuery({
    queryKey: [...data.key, 'invitation'],
    enabled: data.active,
    retry: false,
    gcTime: 0,
    queryFn: ({ signal }) => data.read(readOwnAdmin, signal, false),
  });
  const accept = useNativeCommand(
    'Admin:accept',
    data.actorId,
    async (client, _body: null, key) => {
      const result = await acceptAdminInvitation(client, key);
      await data.session.refetch();
      return result;
    },
    [data.key],
    data.key,
  );
  async function refresh() {
    await own.refetch();
    await data.session.refetch();
  }
  const account = !own.isError ? own.data : undefined;
  return (
    <AdminPage title="Admin invitation" backTo="/account" backDisabled={accept.isPending}>
      <NativeCommandRecovery command={accept} />
      {own.isPending ? <Copy>Checking…</Copy> : null}
      {own.isError ? (
        own.error instanceof ApiFailure && own.error.code === 'NOT_FOUND' ? (
          <Copy>No invitation</Copy>
        ) : (
          <AdminError
            error={own.error}
            retry={() => {
              void refresh();
            }}
          />
        )
      ) : null}
      {accept.isError ? <AdminError error={accept.error} /> : null}
      {account ? (
        <AdminCard>
          <AdminHeading>{account.fullName}</AdminHeading>
          <StatusBadge value={account.status} />
          <Fact icon={UserCog}>{account.roles.map((role) => roleLabels[role]).join(', ')}</Fact>
          {account.status === 'invited' ? (
            <Button
              label="Accept Admin invitation"
              disabled={accept.isPending || accept.unresolved}
              onPress={() => accept.mutate(null)}
            />
          ) : null}
          {account.status === 'active' ? (
            <Button
              label="Enter Admin"
              onPress={() => {
                void data.session.refetch().then((profile) => {
                  if (profile?.capabilities.admin) router.replace('/admin');
                });
              }}
            />
          ) : null}
        </AdminCard>
      ) : null}
      {accept.isSuccess ? <Fact icon={Check}>Accepted</Fact> : null}
    </AdminPage>
  );
}
