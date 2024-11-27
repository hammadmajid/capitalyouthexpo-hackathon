import { AdminSafety } from '../../components/admin/safety';
import { StaffAccess } from '../../components/admin/staff-access';
export default function Safety() {
  return (
    <StaffAccess module="safety">
      <AdminSafety />
    </StaffAccess>
  );
}
