import { Stack } from 'expo-router';
import { AdminAccess } from '../../components/admin/access';
export default function AdminLayout() {
  return (
    <AdminAccess cacheBoundary>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="admins" />
      </Stack>
    </AdminAccess>
  );
}
