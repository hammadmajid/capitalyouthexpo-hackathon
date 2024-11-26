import { useQuery } from '@tanstack/react-query';
import { readOwnResidentLinkStatus } from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { Copy } from './ui';
export function OwnResidentLinkStatus({ actorId }: { actorId: string }) {
  const status = useQuery({
    queryKey: ['private-stays', actorId, 'link-status'],
    gcTime: 0,
    retry: false,
    queryFn: async () => readOwnResidentLinkStatus(await actorClient(actorId)),
  });
  if (status.isError) return <Copy alert>{safeMessage(status.error)}</Copy>;
  return status.data?.pending ? (
    <Copy>Your hostel is confirming your account. Your stay will appear after approval.</Copy>
  ) : null;
}
