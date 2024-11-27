import { Skeleton } from '../loading/skeleton';
import { AdminHeader } from './navigation-header';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { listAdmins } from '@hsm/api-client';
import { ShieldCheck, Users, UserPlus, UserRound } from 'lucide-react-native';
import { mobileColors as colors, radii, spacing } from '@hsm/ui';
import { useAdminData } from './data';
import { AdminError, AdminHeading, roleLabels } from './ui';
import { DashboardHero, DashboardPage } from './dashboard-ui';
import { ActionGrid, type GridAction } from './admin-grid';
import { RecordRow } from './admin-list';
import { AdminOperations } from './operations-nav';
// ADM-001: Root sees team counts and team actions; a Normal Admin sees only assigned modules.
export function AdminWorkspace() {
  const data = useAdminData();
  const admin = data.profile?.capabilities.admin;
  const summary = useQuery({
    queryKey: [...data.key, 'summary'],
    enabled: data.active && Boolean(admin?.isRoot),
    retry: false,
    gcTime: 0,
    queryFn: ({ signal }) => data.read((c) => listAdmins(c, { limit: 1 }), signal),
  });
  if (!admin) return null;
  const actions: GridAction[] = [
    { label: 'My profile', icon: UserRound, onPress: () => router.push('/admin/profile') },
  ];
  return (
    <DashboardPage showBrand={!admin.isRoot}>
      {admin.isRoot ? (
        <AdminHeader title="Admin management" />
      ) : (
        <DashboardHero root={false} name={data.profile?.user.fullName || 'Administrator'} />
      )}
      {admin.isRoot ? (
        summary.isPending ? (
          <Skeleton kind="list" label="Loading Admin membership…" />
        ) : summary.isError ? (
          <AdminError
            error={summary.error}
            retry={() => {
              void summary.refetch();
            }}
          />
        ) : (
          // One plain list: each row shows its count and opens its screen.
          <View style={{ gap: spacing.sm }}>
            <RecordRow
              icon={Users}
              title="Admins"
              subtitle={String(summary.data.totalCount)}
              label={summary.data.totalCount + ' Admins'}
              onPress={() => router.push('/admin/admins')}
            />
            <RecordRow
              icon={ShieldCheck}
              title="Root seats"
              subtitle={
                summary.data.activeRootCount === null
                  ? undefined
                  : summary.data.activeRootCount + ' of 3 used'
              }
              label="Root seats"
              onPress={() => router.push('/admin/admins?roots=true')}
            />
            <RecordRow
              icon={UserPlus}
              title="Invite Admin"
              label="Invite Admin"
              onPress={() => router.push('/admin/admins/invite')}
            />
            <RecordRow
              icon={UserRound}
              title="My profile"
              label="My profile"
              onPress={() => router.push('/admin/profile')}
            />
          </View>
        )
      ) : (
        <AssignedRoles roles={admin.roles} />
      )}
      {admin.isRoot ? null : <ActionGrid actions={actions} />}
      {!admin.isRoot ? <AdminOperations /> : null}
    </DashboardPage>
  );
}
function AssignedRoles({ roles }: { roles: string[] }) {
  const names = roles
    .filter((r): r is keyof typeof roleLabels => r in roleLabels)
    .map((r) => roleLabels[r]);
  return (
    <View style={{ gap: spacing.sm }}>
      <AdminHeading>Roles</AdminHeading>
      <View style={styles.chips}>
        {names.length ? (
          names.map((name) => (
            <Text key={name} className="font-heading text-sm text-primary" style={styles.chip}>
              {name}
            </Text>
          ))
        ) : (
          <Text className="font-body text-body text-secondary">None assigned</Text>
        )}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    backgroundColor: colors.aqua,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    overflow: 'hidden',
  },
});
