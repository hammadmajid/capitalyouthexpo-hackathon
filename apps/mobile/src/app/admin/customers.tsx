import { CustomerGovernance } from '../../components/admin/customer-governance';
import { StaffAccess } from '../../components/admin/staff-access';
export default function Customers() {
  return (
    <StaffAccess module="governance">
      <CustomerGovernance />
    </StaffAccess>
  );
}
