import { router } from 'expo-router';
import { OwnerMenu } from '../components/owner-menu';
export default function OwnerMenuRoute() {
  return (
    <OwnerMenu open close={() => (router.canGoBack() ? router.back() : router.replace('/owner'))} />
  );
}
