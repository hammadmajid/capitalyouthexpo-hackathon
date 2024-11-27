import { PlatformInsights } from '../../components/admin/platform-insights';
import { StaffAccess } from '../../components/admin/staff-access';
export default function Insights() {
  return (
    <StaffAccess module="insights">
      <PlatformInsights />
    </StaffAccess>
  );
}
