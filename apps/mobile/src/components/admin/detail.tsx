import { Skeleton } from '../loading/skeleton';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { stayIdentifierSchema } from '@hsm/contracts';
import { readAdminAccount } from '@hsm/api-client';
import { useAdminData } from './data';
import { ShieldCheck, User } from 'lucide-react-native';
import { AdminCard, AdminError, AdminHeading, AdminPage, roleLabels } from './ui';
import { StatusBadge } from './management-ui';
import { Fact } from './admin-list';
import { adminChangeError } from './change-error';
import { useAdminChange } from './detail-change';
import { AdminActions, AdminConfirmation } from './detail-controls';
import { NativeCommandRecovery } from '../services/command-recovery';
import { Copy } from '../ui';
export function AdminDetail() {
  const input = useLocalSearchParams<{ userId: string }>().userId;
  const target = stayIdentifierSchema.safeParse(input);
  if (!target.success)
    return (
      <AdminPage title="Admin unavailable" backTo="/admin/admins">
        <Copy alert>Invalid Admin reference.</Copy>
      </AdminPage>
    );
  return <Detail key={target.data} target={target.data} />;
}
function Detail({ target }: { target: string }) {
  const data = useAdminData();
  const query = useQuery({
    queryKey: [...data.key, 'account', target],
    enabled: data.active,
    gcTime: 0,
    retry: false,
    queryFn: ({ signal }) => data.read((c) => readAdminAccount(c, target), signal),
  });
  const row = !query.isError ? query.data : undefined;
  const form = useAdminChange(target, row?.roles ?? []);
  const mutation = form.mutation;
  return (
    <AdminPage title="Manage Admin" backTo="/admin/admins" backDisabled={mutation.isPending}>
      <NativeCommandRecovery command={mutation} />
      {query.isPending ? <Skeleton kind="details" label="Loading Admin record" /> : null}
      {query.isError ? (
        <AdminError
          error={query.error}
          retry={() => {
            void query.refetch();
          }}
        />
      ) : null}
      {mutation.isError ? <Copy alert>{adminChangeError(mutation.error)}</Copy> : null}
      {mutation.isSuccess ? <Copy>Saved.</Copy> : null}
      {row ? (
        <AdminCard>
          <AdminHeading>{row.fullName || 'Administrator'}</AdminHeading>
          <StatusBadge value={row.status} />
          <Fact icon={row.isRoot ? ShieldCheck : User}>
            {row.isRoot
              ? 'Root · all roles'
              : row.roles.map((r) => roleLabels[r]).join(', ') || 'No roles'}
          </Fact>
          {form.action ? (
            <AdminConfirmation form={form} />
          ) : (
            <AdminActions account={row} form={form} />
          )}
        </AdminCard>
      ) : null}
    </AdminPage>
  );
}
