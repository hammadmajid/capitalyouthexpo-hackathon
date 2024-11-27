import { AdminBookingPolicy } from '../../components/admin/booking-policy';
import { StaffAccess } from '../../components/admin/staff-access';
export default function Policy() {
  return (
    <StaffAccess module="policy">
      <AdminBookingPolicy />
    </StaffAccess>
  );
}
