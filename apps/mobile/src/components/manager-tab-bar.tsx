import { router } from 'expo-router';
import { LayoutDashboard, PanelsTopLeft, UserRound, Users } from 'lucide-react-native';
import { useSession } from './providers';
import { OwnerTabBar } from './owner-tab-bar';
import { usePickedManagerBranch } from '../lib/manager-branch';
type ManagerTab = 'dashboard' | 'operations' | 'residents' | 'account';
// MGRD: the Manager workspace's bottom navigation (same bar as the Owner's).
export function ManagerTabBar({ active }: { active: ManagerTab }) {
  const branch = usePickedManagerBranch(useSession().profile?.capabilities.managerOf ?? []);
  const go = (href: Parameters<typeof router.replace>[0]) => router.replace(href);
  return (
    <OwnerTabBar
      tabs={[
        {
          label: 'Dashboard',
          Icon: LayoutDashboard,
          active: active === 'dashboard',
          onPress: () => go('/manager'),
        },
        {
          label: 'Operations',
          Icon: PanelsTopLeft,
          active: active === 'operations',
          onPress: () => go('/manager-operations'),
        },
        {
          label: 'Residents',
          Icon: Users,
          active: active === 'residents',
          onPress: () =>
            branch &&
            go({
              pathname: '/manager-branch',
              params: { branchId: branch.branchId, tool: 'stays', tab: 'residents' },
            }),
        },
        {
          label: 'Account',
          Icon: UserRound,
          active: active === 'account',
          onPress: () => go('/manager-account'),
        },
      ]}
    />
  );
}
