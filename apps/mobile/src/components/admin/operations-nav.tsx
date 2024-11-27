import { View } from 'react-native';
import { router } from 'expo-router';
import {
  ChartNoAxesCombined,
  GraduationCap,
  Megaphone,
  MessagesSquare,
  ScrollText,
  Settings,
  Star,
} from 'lucide-react-native';
import { spacing } from '@hsm/ui';
import { moduleAllowed } from '../../lib/admin-modules';
import { useSession } from '../providers';
import { AdminHeading } from './ui';
import { ActionGrid, type GridAction } from './admin-grid';
// Only modules the server-assigned roles allow are shown; each tile is one tap to its queue.
// Hostel verifications lead the dashboard; suspensions live on each user's and hostel's screen.
// CHG-036: no Identity or Photos review queues; verified accounts edit their own details.
export function AdminOperations({
  showHeading = true,
  pending,
}: {
  showHeading?: boolean;
  pending?: { verification?: number; support?: number; moderation?: number };
}) {
  const profile = useSession().profile;
  const actions: (GridAction | false)[] = [
    moduleAllowed(profile, 'support') && {
      label: 'Support',
      icon: MessagesSquare,
      badge: pending?.support,
      onPress: () => router.push('/admin/support'),
    },
    moduleAllowed(profile, 'moderation') && {
      label: 'Reviews',
      icon: Star,
      badge: pending?.moderation,
      onPress: () => router.push('/admin/moderation'),
    },
    moduleAllowed(profile, 'announcements') && {
      label: 'Announcements',
      icon: Megaphone,
      onPress: () => router.push('/admin/announcements'),
    },
    moduleAllowed(profile, 'policy') && {
      label: 'Platform policies',
      icon: Settings,
      onPress: () => router.push('/admin/policy'),
    },
    moduleAllowed(profile, 'institutions') && {
      label: 'Places',
      icon: GraduationCap,
      onPress: () => router.push('/admin/institutions'),
    },
    moduleAllowed(profile, 'insights') && {
      label: 'Analytics',
      icon: ChartNoAxesCombined,
      onPress: () => router.push('/admin/insights'),
    },
    moduleAllowed(profile, 'audit') && {
      label: 'Audit log',
      icon: ScrollText,
      onPress: () => router.push('/admin/audit'),
    },
  ];
  return (
    <View style={{ gap: spacing.md }}>
      {showHeading ? <AdminHeading>Operations</AdminHeading> : null}
      <ActionGrid actions={actions.filter((a): a is GridAction => Boolean(a))} />
    </View>
  );
}
