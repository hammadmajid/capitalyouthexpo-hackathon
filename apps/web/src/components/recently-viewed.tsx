import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listMarketplace } from '@hsm/api-client';
import { marketplaceColors as colors, marketplaceMetrics as metrics } from '@hsm/ui';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { MarketplaceButton } from './ui/marketplace-button';
import { useRecentlyViewedIds } from './recently-viewed-history';
import { RecentHostelCard } from './recent-hostel-card';
export function RecentlyViewed() {
  const ids = useRecentlyViewedIds(),
    [all, setAll] = useState(false);
  const query = useQuery({
    queryKey: ['marketplace-recent', ids],
    enabled: ids.length > 0,
    queryFn: () => listMarketplace(browserClient(), { ids: [...ids], limit: 20 }),
  });
  const byId = new Map(query.data?.data.map((listing) => [listing.branchId, listing]));
  const rows = ids.flatMap((id) => {
    const listing = byId.get(id);
    return listing ? [listing] : [];
  });
  return (
    <section aria-label="Recently viewed hostels" style={{ display: 'grid', gap: metrics.lg }}>
      <h2 style={{ color: colors.heading, fontSize: metrics.headingSize }}>Recently Viewed</h2>
      {!ids.length ? (
        <p>Hostels you open will appear here.</p>
      ) : query.isPending ? (
        <p role="status">Loading recently viewed hostels…</p>
      ) : query.isError ? (
        <div>
          <p role="alert">{errorMessage(query.error)}</p>
          <MarketplaceButton variant="secondary" onClick={() => void query.refetch()}>
            Retry recently viewed hostels
          </MarketplaceButton>
        </div>
      ) : (
        <>
          {!rows.length ? <p>No recently viewed hostels are currently listed.</p> : null}
          <div
            style={{
              display: 'grid',
              gap: metrics.md,
              gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${metrics.heroHeight}px), 1fr))`,
            }}
          >
            {(all ? rows : rows.slice(0, 4)).map((listing) => (
              <RecentHostelCard
                key={listing.branchId + ':' + (listing.media[0]?.id ?? '')}
                listing={listing}
              />
            ))}
          </div>
          {rows.length > 4 ? (
            <MarketplaceButton variant="secondary" onClick={() => setAll((value) => !value)}>
              {all ? 'Show fewer recently viewed hostels' : 'See all recently viewed hostels'}
            </MarketplaceButton>
          ) : null}
        </>
      )}
    </section>
  );
}
