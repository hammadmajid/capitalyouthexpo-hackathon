import { SupportQueue } from '../../../components/admin/support-queue';
import { StaffAccess } from '../../../components/admin/staff-access';
export default function Tickets() {
  return (
    <StaffAccess module="support">
      <SupportQueue />
    </StaffAccess>
  );
}
