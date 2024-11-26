import { Redirect } from 'expo-router';
import { useSession } from '../components/providers';
import { CustomerMarketplace } from '../components/marketplace/customer';
export default function Marketplace() {
  const { profile } = useSession();
  if (!profile) return <Redirect href="/" />;
  if (!profile.capabilities.customer) return <Redirect href="/customer-profile" />;
  return <CustomerMarketplace actorId={profile.user.id} name={profile.user.fullName} />;
}
