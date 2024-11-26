import { Redirect, router } from 'expo-router';
import { useSession } from '../components/providers';
import { AccountModes } from '../components/account-modes';

export default function Account() {
  const { profile } = useSession();
  if (!profile) return <Redirect href="/" />;
  return <AccountModes profile={profile} onOptions={() => router.push('/account-options')} />;
}
