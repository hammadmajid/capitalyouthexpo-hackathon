import { Skeleton } from '../loading/skeleton';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useOwnAdmin } from './data';
import { AdminCard, AdminError, AdminHeading, AdminPage, roleLabels } from './ui';
import { AdminModes } from './modes';
import { Lock, ShieldCheck, UserCog, UserRound } from 'lucide-react-native';
import { StatusBadge } from './management-ui';
import { ActionButton, ButtonRow, Fact } from './admin-list';
export function AdminProfile() {
  const data = useOwnAdmin();
  const query = useQuery({
    queryKey: [...data.key, 'own'],
    enabled: data.active,
    gcTime: 0,
    retry: false,
    queryFn: ({ signal }) => data.load(signal),
  });
  const account = !query.isError ? query.data : undefined;
  return (
    <AdminPage title="Profile">
      {query.isPending ? <Skeleton kind="details" label="Loading Admin profile" /> : null}
      {query.isError ? (
        <AdminError
          error={query.error}
          retry={() => {
            void query.refetch();
          }}
        />
      ) : null}
      {account ? (
        <AdminCard>
          <AdminHeading>{account.fullName || 'Administrator'}</AdminHeading>
          <StatusBadge value={account.status} />
          <Fact icon={account.isRoot ? ShieldCheck : UserCog}>
            {account.isRoot
              ? 'Root · all roles'
              : account.roles.map((r) => roleLabels[r]).join(', ') || 'No roles'}
          </Fact>
        </AdminCard>
      ) : null}
      <ButtonRow>
        <ActionButton
          icon={Lock}
          text="Security"
          label="Account security"
          tone="solid"
          onPress={() => router.push('/security')}
        />
        {data.profile?.user.emailVerified ? (
          <ActionButton
            icon={UserRound}
            text="Customer profile"
            label={
              data.profile.capabilities.customer
                ? 'Edit Customer profile'
                : 'Complete Customer profile'
            }
            onPress={() => router.push('/customer-profile')}
          />
        ) : null}
      </ButtonRow>
      <AdminModes />
    </AdminPage>
  );
}
