import { useSession } from '../components/providers';
import { OwnerScreen } from '../components/owner-screen';
import { OwnerNotificationsList } from '../components/owner-notifications';
export default function OwnerNotifications() {
  const profile = useSession().profile;
  return (
    <OwnerScreen title="Notifications">
      {profile ? <OwnerNotificationsList key={profile.user.id} actorId={profile.user.id} /> : null}
    </OwnerScreen>
  );
}
