import { AdminAccess } from '../../components/admin/access';
import { AdminWorkspace } from '../../components/admin/workspace';
export default function AdminManagement() {
  return (
    <AdminAccess>
      <AdminWorkspace />
    </AdminAccess>
  );
}
