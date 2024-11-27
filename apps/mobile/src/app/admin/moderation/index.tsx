import { ModerationQueue } from '../../../components/admin/moderation-queue';
import { StaffAccess } from '../../../components/admin/staff-access';
export default function Moderation() {
  return (
    <StaffAccess module="moderation">
      <ModerationQueue />
    </StaffAccess>
  );
}
