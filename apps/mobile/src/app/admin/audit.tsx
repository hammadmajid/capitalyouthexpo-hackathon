import { PlatformAuditBrowser } from '../../components/admin/audit-browser';
import { StaffAccess } from '../../components/admin/staff-access';
export default function Audit() {
  return (
    <StaffAccess module="audit">
      <PlatformAuditBrowser />
    </StaffAccess>
  );
}
