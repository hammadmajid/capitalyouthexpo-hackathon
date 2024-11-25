'use client';
import Link from 'next/link';
import { marketplacePrice } from '@hsm/api-client';
import { MarketplaceButton as Button } from './ui/marketplace-button';
import { errorMessage } from '../lib/messages';
import { inventoryScopeDenied } from './use-branch-inventory';
import { useSavedHostels } from './use-saved-hostels';
export function SavedHostels(props: { actorId: string }) {
  return <SavedHistory key={props.actorId} {...props} />;
}
function SavedHistory({ actorId }: { actorId: string }) {
  const { query, mutation } = useSavedHostels(actorId);
  const denied = [query.error, mutation.error].find(inventoryScopeDenied);
  if (denied)
    return (
      <section aria-label="Saved hostels">
        <p role="alert">{errorMessage(denied)}</p>
      </section>
    );
  return (
    <section aria-label="Saved hostels" className="space-y-4">
      <h3 className="text-xl font-semibold">Saved hostels</h3>
      {query.isPending ? (
        <div className="customer-skeleton h-24" role="status" aria-label="Loading saved hostels" />
      ) : null}
      {query.error ? (
        <>
          <p role="alert">{errorMessage(query.error)}</p>
          <Button variant="secondary" onClick={() => void query.refetch()}>
            Retry Saved hostels
          </Button>
        </>
      ) : null}
      {mutation.error ? <p role="alert">{errorMessage(mutation.error)}</p> : null}
      {mutation.isSuccess ? <p role="status">Saved preference updated by the server.</p> : null}
      {query.data?.pages.every((page) => page.data.length === 0) ? (
        <p>No approved Saved hostels are available.</p>
      ) : null}
      {query.data?.pages
        .flatMap((page) => page.data)
        .map((listing) => (
          <article key={listing.branchId} className="customer-frost space-y-2 p-4">
            <h4 className="font-semibold">
              <Link className="text-link" href={'/hostels/' + listing.branchId}>
                {listing.name}
              </Link>
            </h4>
            <p>Verified property · {[listing.area, listing.city].filter(Boolean).join(', ')}</p>
            <p>
              {listing.priceFromPaisa === null
                ? 'Pricing unavailable'
                : 'From ' + marketplacePrice(listing.priceFromPaisa) + ' / month'}
            </p>
            <Button
              variant="secondary"
              disabled={mutation.isPending || query.isFetching || Boolean(query.error)}
              onClick={() => mutation.mutate({ branchId: listing.branchId, saved: false })}
            >
              Remove {listing.name} from Saved
            </Button>
          </article>
        ))}
      {query.hasNextPage ? (
        <Button
          variant="secondary"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          More Saved hostels
        </Button>
      ) : null}
      <Link className="text-link block" href="/">
        Find hostels
      </Link>
    </section>
  );
}
