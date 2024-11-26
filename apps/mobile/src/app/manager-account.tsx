import { Redirect } from 'expo-router';
import { useSession } from '../components/providers';
import { ManagerAccount } from '../components/manager-account';
export default function ManagerAccountRoute() {
  const profile = useSession().profile;
  if (!profile) return <Redirect href="/" />;
  if (!profile.capabilities.managerOf.length) return <Redirect href="/account" />;
  return <ManagerAccount />;
}
