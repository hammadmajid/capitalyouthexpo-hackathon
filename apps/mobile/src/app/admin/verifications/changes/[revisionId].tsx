import { useLocalSearchParams } from 'expo-router';
import { HostelRevisionReviewScreen } from '../../../../components/admin/hostel-revision-review';
import { StaffAccess } from '../../../../components/admin/staff-access';
// CHG-041: Verification admins review edits to an approved hostel.
export default function HostelRevisionRoute() {
  const { revisionId } = useLocalSearchParams<{ revisionId: string }>();
  return (
    <StaffAccess module="verification">
      <HostelRevisionReviewScreen revisionId={String(revisionId ?? '')} />
    </StaffAccess>
  );
}
