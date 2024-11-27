import { SupportDetail } from '../../../components/admin/support-detail';
import { StaffAccess } from '../../../components/admin/staff-access';
export default function Ticket() {
  return (
    <StaffAccess module="support">
      <SupportDetail />
    </StaffAccess>
  );
}
