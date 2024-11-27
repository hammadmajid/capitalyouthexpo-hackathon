import { AdminAccess } from '../../components/admin/access';
import { AdminOperations } from '../../components/admin/operations-nav';
import { AdminPage } from '../../components/admin/ui';

export default function PlatformOperations() {
  return (
    <AdminAccess rootOnly>
      <AdminPage title="Platform operations">
        <AdminOperations showHeading={false} />
      </AdminPage>
    </AdminAccess>
  );
}
