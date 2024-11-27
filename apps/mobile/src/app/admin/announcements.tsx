import { AdminAnnouncements } from '../../components/admin/announcements';
import { StaffAccess } from '../../components/admin/staff-access';
export default function Announcements() {
  return (
    <StaffAccess module="announcements">
      <AdminAnnouncements />
    </StaffAccess>
  );
}
