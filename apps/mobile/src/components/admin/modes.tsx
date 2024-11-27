import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { clearAdminCache } from '../../lib/admin-cache';
import { rememberMode } from '../../lib/owner-mode';
import { useSession } from '../providers';
import { Button } from '../ui';
export function useAdminModeNavigation() {
  const profile = useSession().profile;
  const cache = useQueryClient();
  const userId = profile?.user.id;
  async function leave(mode: 'customer' | 'owner') {
    if (!userId) return;
    clearAdminCache(cache);
    await rememberMode(userId, mode);
    router.replace(mode === 'customer' ? '/marketplace' : '/owner');
  }
  function allAccounts() {
    clearAdminCache(cache);
    router.replace('/account');
  }
  async function openCustomer() {
    if (!profile) return;
    if (profile.capabilities.customer) return leave('customer');
    clearAdminCache(cache);
    router.push(profile.user.emailVerified ? '/customer-profile' : '/account');
  }
  return { profile, leave, allAccounts, openCustomer };
}
export function AdminModes() {
  const { profile, leave, allAccounts } = useAdminModeNavigation();
  if (!profile) return null;
  return (
    <>
      {profile.capabilities.customer ? (
        <Button
          secondary
          label="Switch to Customer"
          onPress={() => {
            void leave('customer');
          }}
        />
      ) : null}
      {profile.capabilities.owner && profile.user.emailVerified ? (
        <Button
          secondary
          label="Switch to Owner"
          onPress={() => {
            void leave('owner');
          }}
        />
      ) : null}
      <Button secondary label="All account spaces" onPress={allAccounts} />
    </>
  );
}
