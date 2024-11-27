import type { ReactNode } from 'react';
import { router } from 'expo-router';
import { moduleAllowed, type AdminModule } from '../../lib/admin-modules';
import { useSession } from '../providers';
import { AdminAccess } from './access';
import { AdminPage } from './ui';
import { Button, Copy } from '../ui';
export function StaffAccess({ module, children }: { module: AdminModule; children: ReactNode }) {
  return (
    <AdminAccess>
      <ModuleContent module={module}>{children}</ModuleContent>
    </AdminAccess>
  );
}
function ModuleContent({ module, children }: { module: AdminModule; children: ReactNode }) {
  const profile = useSession().profile;
  if (!moduleAllowed(profile, module))
    return (
      <AdminPage title="Access unavailable">
        <Copy>Your current Admin roles do not allow this workspace.</Copy>
        <Button label="Admin workspace" onPress={() => router.replace('/admin')} />
      </AdminPage>
    );
  return <>{children}</>;
}
