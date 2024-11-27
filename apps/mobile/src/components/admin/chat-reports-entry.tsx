import { router } from 'expo-router';
import { ShieldAlert } from 'lucide-react-native';
import { moduleAllowed } from '../../lib/admin-modules';
import { useSession } from '../providers';
import { RecordRow } from './admin-list';
// Chat safety reports (abusive or unsafe messages) open from Complaints for staff allowed to
// review them; the case screen keeps its own access check and reasons (SEC-003).
export function ChatReportsEntry() {
  const profile = useSession().profile;
  if (!moduleAllowed(profile, 'safety')) return null;
  return (
    <RecordRow
      icon={ShieldAlert}
      title="Chat reports"
      subtitle="Reported messages"
      label="Open chat reports"
      onPress={() => router.push('/admin/safety')}
    />
  );
}
