import { Skeleton } from '../loading/skeleton';
import { router, useLocalSearchParams } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { listAdmins } from '@hsm/api-client';
import { useAdminData } from './data';
import { ShieldCheck, User, UserPlus } from 'lucide-react-native';
import { AdminError, AdminPage, roleLabels } from './ui';
import { Button, Copy } from '../ui';
import { ActionButton, ButtonRow, Fact, RecordRow } from './admin-list';
export function AdminAccounts() {
  const data = useAdminData();
  const rootsOnly = useLocalSearchParams<{ roots?: string }>().roots === 'true';
  const list = useInfiniteQuery({
    queryKey: [...data.key, 'accounts'],
    enabled: data.active,
    initialPageParam: undefined as string | undefined,
    retry: false,
    gcTime: 0,
    queryFn: ({ pageParam, signal }) =>
      data.read(
        (c) =>
          listAdmins(c, {
            limit: 20,
            ...(pageParam ? { cursor: pageParam } : {}),
          }),
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const hidden = list.isError;
  const rows = hidden ? [] : (list.data?.pages.flatMap((p) => p.data) ?? []);
  const unique = [...new Map(rows.map((row) => [row.userId, row])).values()];
  const first = !hidden ? list.data?.pages[0] : undefined;
  return (
    <AdminPage title={rootsOnly ? 'Root membership' : 'Admin accounts'}>
      <ButtonRow>
        <ActionButton
          icon={UserPlus}
          text="Invite Admin"
          label="Invite Normal Admin"
          tone="solid"
          onPress={() => router.push('/admin/admins/invite')}
        />
      </ButtonRow>
      {list.isPending ? <Skeleton kind="list" label="Loading authorized Admin accounts…" /> : null}
      {list.isError ? (
        <AdminError
          error={list.error}
          retry={() => {
            void list.refetch();
          }}
        />
      ) : null}
      {first ? (
        <Fact icon={ShieldCheck}>
          {(first.activeRootCount ?? '—') + ' / 3 Root · ' + (first.totalCount ?? '—') + ' total'}
        </Fact>
      ) : null}
      {!hidden && !list.isPending && unique.length === 0 ? (
        <Copy>No Admin accounts on this page.</Copy>
      ) : null}
      {unique
        .filter((row) => !rootsOnly || row.isRoot)
        .map((row) => (
          <RecordRow
            key={row.userId}
            icon={row.isRoot ? ShieldCheck : User}
            title={row.fullName || 'Administrator'}
            subtitle={
              row.isRoot
                ? 'Root · all roles'
                : row.roles.map((r) => roleLabels[r]).join(', ') || 'No roles'
            }
            status={row.status}
            label={'Manage ' + (row.fullName || 'Administrator')}
            onPress={() =>
              router.push({
                pathname: '/admin/admins/[userId]',
                params: { userId: row.userId },
              })
            }
          />
        ))}
      {!hidden && list.hasNextPage ? (
        <Button
          secondary
          label={list.isFetchingNextPage ? 'Loading more…' : 'Load more Admins'}
          disabled={list.isFetchingNextPage}
          onPress={() => {
            void list.fetchNextPage();
          }}
        />
      ) : null}
    </AdminPage>
  );
}
