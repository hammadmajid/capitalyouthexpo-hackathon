import { VerificationDetail } from '../../../components/admin/verification-detail';
import { StaffAccess } from '../../../components/admin/staff-access';
export default function Detail() {
  return (
    <StaffAccess module="verification">
      <VerificationDetail />
    </StaffAccess>
  );
}
