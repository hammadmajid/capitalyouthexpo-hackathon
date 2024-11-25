'use client';
import { useState } from 'react';
import Image from 'next/image';
import { useInfiniteQuery } from '@tanstack/react-query';
import { publicGallery } from '@hsm/api-client';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { MarketplaceButton } from './ui/marketplace-button';
function Photo({ id, altText }: { id: string; altText: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <p>Photo unavailable: {altText}</p>
  ) : (
    <Image
      unoptimized
      width={640}
      height={420}
      className="h-60 w-full rounded-panel object-cover"
      src={'/api/v1/marketplace/media/' + id}
      alt={altText}
      onError={() => setFailed(true)}
    />
  );
}
export function PublicGallery({ branchId }: { branchId: string }) {
  const query = useInfiniteQuery({
    queryKey: ['public-gallery', branchId],
    initialPageParam: null,
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      publicGallery(browserClient(), branchId, {
        limit: 20,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (page) => page.nextCursor,
    staleTime: 0,
  });
  const photos = [
    ...new Map(
      query.data?.pages.flatMap((page) => page.data).map((photo) => [photo.id, photo]),
    ).values(),
  ];
  return (
    <section aria-label="Hostel photos" className="space-y-4">
      <h2 className="text-xl font-semibold">Hostel photos</h2>
      {query.isPending ? <p role="status">Loading hostel photos…</p> : null}
      {query.isError ? (
        <p role="alert">{errorMessage(query.error)}</p>
      ) : (
        <>
          {query.isSuccess && !photos.length ? (
            <p>No published hostel photos are available.</p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {photos.map((photo) => (
              <Photo key={photo.id} {...photo} />
            ))}
          </div>
        </>
      )}
      {query.hasNextPage && !query.isError ? (
        <MarketplaceButton
          variant="secondary"
          disabled={query.isFetching}
          onClick={() => void query.fetchNextPage()}
        >
          Load more hostel photos
        </MarketplaceButton>
      ) : null}
      <MarketplaceButton
        variant="secondary"
        disabled={query.isFetching}
        onClick={() => void query.refetch()}
      >
        Refresh hostel photos
      </MarketplaceButton>
    </section>
  );
}
