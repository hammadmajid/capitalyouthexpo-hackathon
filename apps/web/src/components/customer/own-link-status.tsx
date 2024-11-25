'use client';
import { useQuery } from '@tanstack/react-query';
import { readOwnResidentLinkStatus } from '@hsm/api-client';
import { browserClient } from '../../lib/client';
import { errorMessage } from '../../lib/messages';
// CHG-009: a hostel confirms a customer's link to a resident record before the Stay appears.
export function OwnLinkStatus({ actorId }: { actorId: string }) {
  const status = useQuery({
    queryKey: ['private-stays', actorId, 'link-status'],
    gcTime: 0,
    retry: false,
    queryFn: () => readOwnResidentLinkStatus(browserClient()),
  });
  if (status.error) return <p role="alert">{errorMessage(status.error)}</p>;
  return status.data?.pending ? (
    <p role="status">
      Your hostel is confirming your account. Your stay will appear after approval.
    </p>
  ) : null;
}
