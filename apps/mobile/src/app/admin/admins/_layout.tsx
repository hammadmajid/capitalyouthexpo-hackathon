import { Stack } from 'expo-router';
import { AdminAccess } from '../../../components/admin/access';
export default function RootAdminLayout() {
  return (
    <AdminAccess rootOnly>
      <Stack screenOptions={{ headerShown: false }} />
    </AdminAccess>
  );
}
