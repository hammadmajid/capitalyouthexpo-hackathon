import { VerificationQueue } from '../../../components/admin/verification-queue';
import { StaffAccess } from '../../../components/admin/staff-access';
// ADM-007: Root and Verification admins share the same direct queue.
export default function Verifications() {
  return (
    <StaffAccess module="verification">
      <VerificationQueue />
    </StaffAccess>
  );
}
