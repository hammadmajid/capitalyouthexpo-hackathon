'use client';
import { useInfiniteQuery } from '@tanstack/react-query';
import { listPublicListingRules } from '@hsm/api-client';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { MarketplaceButton } from './ui/marketplace-button';
export function PublicListingRules({ branchId }: { branchId: string }) {
  const query = useInfiniteQuery({
    queryKey: ['public-listing-rules', branchId],
    initialPageParam: null,
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      listPublicListingRules(browserClient(), branchId, {
        limit: 20,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (page) => page.nextCursor,
    staleTime: 0,
  });
  const rules = [
    ...new Map(
      query.data?.pages.flatMap((page) => page.data).map((rule) => [rule.id, rule]),
    ).values(),
  ];
  return (
    <section aria-label="Hostel rules" className="space-y-4">
      <h2 className="text-xl font-semibold">Hostel rules</h2>
      {query.isPending ? <p role="status">Loading hostel rules…</p> : null}
      {query.isError ? (
        <p role="alert">{errorMessage(query.error)}</p>
      ) : (
        <>
          {query.isSuccess && !rules.length ? (
            <p>No published hostel rules are available.</p>
          ) : null}
          <ul className="list-disc space-y-2 pl-5">
            {rules.map((rule) => (
              <li key={rule.id} className="whitespace-pre-wrap break-words">
                {rule.body}
              </li>
            ))}
          </ul>
        </>
      )}
      {query.hasNextPage && !query.isError ? (
        <MarketplaceButton
          variant="secondary"
          disabled={query.isFetching}
          onClick={() => void query.fetchNextPage()}
        >
          Load more hostel rules
        </MarketplaceButton>
      ) : null}
      <MarketplaceButton
        variant="secondary"
        disabled={query.isFetching}
        onClick={() => void query.refetch()}
      >
        Refresh hostel rules
      </MarketplaceButton>
    </section>
  );
}
