'use client';
import { useState } from 'react';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { readStayResidentPhoto } from '@hsm/api-client';
import { browserClient } from '../../lib/client';
type Props = { actorId: string; stayId: string; branchId?: string | undefined };
// The resident's own profile photo, read through a short-lived signed URL for this Stay only.
export function StayResidentPhoto({ actorId, stayId, branchId }: Props) {
  const [failed, setFailed] = useState<string>();
  const photo = useQuery({
    queryKey: ['stay-resident-photo', actorId, branchId ?? 'own', stayId],
    retry: false,
    gcTime: 0,
    // Signed URLs expire, so the link is refreshed while the record stays open.
    refetchInterval: 30000,
    queryFn: () => readStayResidentPhoto(browserClient(), stayId, branchId),
  });
  const url = photo.data?.url;
  return (
    <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-full border border-hsm-primary bg-hsm-icy">
      {url && failed !== url ? (
        <Image
          unoptimized
          width={80}
          height={80}
          src={url}
          alt="Resident profile photo"
          className="h-20 w-20 object-cover"
          onError={() => setFailed(url)}
        />
      ) : (
        <span role="img" aria-label="Resident avatar" className="text-2xl text-hsm-primary">
          ●
        </span>
      )}
    </div>
  );
}
