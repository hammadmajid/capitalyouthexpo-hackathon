import { Redirect } from 'expo-router';
import { useSession } from '../components/providers';
import { ManagerHome } from '../components/manager-home';
// MGRD: Manager workspace home; only for accounts the server lists as managing a branch.
export default function Manager() {
  const profile = useSession().profile;
  if (!profile) return <Redirect href="/" />;
  if (!profile.capabilities.managerOf.length) return <Redirect href="/account" />;
  // MGRD: first open completes the same profile Customers give, then returns here.
  if (!profile.capabilities.customer)
    return <Redirect href={{ pathname: '/customer-profile', params: { from: 'manager' } }} />;
  return <ManagerHome />;
}
