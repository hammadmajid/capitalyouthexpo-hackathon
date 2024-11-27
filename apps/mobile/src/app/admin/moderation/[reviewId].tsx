import { ModerationDetail } from '../../../components/admin/moderation-detail';
import { StaffAccess } from '../../../components/admin/staff-access';
export default function Review() {
  return (
    <StaffAccess module="moderation">
      <ModerationDetail />
    </StaffAccess>
  );
}
