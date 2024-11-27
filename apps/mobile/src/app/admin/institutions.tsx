import { AdminInstitutions } from '../../components/admin/institutions';
import { StaffAccess } from '../../components/admin/staff-access';
export default function Institutions() {
  return (
    <StaffAccess module="institutions">
      <AdminInstitutions />
    </StaffAccess>
  );
}
