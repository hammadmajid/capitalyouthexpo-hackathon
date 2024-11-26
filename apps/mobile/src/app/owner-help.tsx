import { useSession } from '../components/providers';
import { OwnerScreen } from '../components/owner-screen';
import { OwnerHelpSupport } from '../components/owner-help-support';
export default function OwnerHelp() {
  const profile = useSession().profile;
  return (
    <OwnerScreen title="Help & Support">
      {profile ? <OwnerHelpSupport key={profile.user.id} actorId={profile.user.id} /> : null}
    </OwnerScreen>
  );
}
