'use client';
import { useState } from 'react';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { readOwnFileUrl } from '@hsm/api-client';
import { browserClient } from '../../lib/client';
// The signed-in user's current profile photo, read through a short-lived signed URL.
export function OwnPhoto({ userId, fileId }: { userId: string; fileId?: string | null }) {
  const [failed, setFailed] = useState<string>();
  const photo = useQuery({
    queryKey: ['own-photo', userId, fileId],
    enabled: Boolean(fileId),
    gcTime: 0,
    retry: false,
    queryFn: () => readOwnFileUrl(browserClient(), fileId ?? ''),
  });
  const url = photo.data?.url;
  return (
    <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-full border border-hsm-primary bg-hsm-icy">
      {url && failed !== url ? (
        <Image
          unoptimized
          width={96}
          height={96}
          src={url}
          alt="Profile photo"
          className="h-24 w-24 object-cover"
          onError={() => setFailed(url)}
        />
      ) : (
        <span role="img" aria-label="No profile photo" className="text-3xl text-hsm-primary">
          ●
        </span>
      )}
    </div>
  );
}
