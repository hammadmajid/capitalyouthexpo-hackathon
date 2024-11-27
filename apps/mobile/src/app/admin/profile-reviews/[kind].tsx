import { useLocalSearchParams } from 'expo-router';
import { StaffAccess } from '../../../components/admin/staff-access';
import { AdminProfileReviews } from '../../../components/admin/profile-reviews';
import { Copy } from '../../../components/ui';
export default function ProfileReviews() {
  const { kind } = useLocalSearchParams<{ kind: string }>();
  if (kind !== 'identity' && kind !== 'profile_photo')
    return <Copy alert>Review type unavailable.</Copy>;
  return (
    <StaffAccess module={kind === 'identity' ? 'identity_reviews' : 'photo_reviews'}>
      <AdminProfileReviews kind={kind} />
    </StaffAccess>
  );
}
