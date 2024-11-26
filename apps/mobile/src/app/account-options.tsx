import { router } from 'expo-router';
import { AccountWorkspace } from '../components/account-workspace';

export default function AccountOptions() {
  return (
    <AccountWorkspace
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/account'))}
    />
  );
}
