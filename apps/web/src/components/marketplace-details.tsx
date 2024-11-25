'use client';
import { VisitRequest } from './visit-request';
import { WaitlistJoin } from './waitlist-join';
import { ChatStart } from './chat-start';
import { PublicListingRules } from './public-listing-rules';
import Link from 'next/link';
import { PublicGallery } from './public-gallery';
import { PublicHeader } from './public-header';
import { PublicFooter } from './public-footer';
import { PublicServices } from './services/panels';
import { SaveHostelAction } from './save-hostel-action';
import { ShareHostel } from './share-hostel';
import { useEffect } from 'react';
import { PublicInventoryOptions } from './public-inventory-options';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { recordRecentlyViewed } from './recently-viewed-history';
import { marketplaceDetails } from '@hsm/api-client';
import { mobileMarketplaceColors as colors, marketplaceMetrics as metrics } from '@hsm/ui';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { authenticationPath } from '../lib/return-path';
export function MarketplaceDetails({ branchId }: { branchId: string }) {
  const cache = useQueryClient();
  const listing = useQuery({
    queryKey: ['marketplace-details', branchId],
    queryFn: () => marketplaceDetails(browserClient(), branchId),
  });
  useEffect(() => {
    if (listing.isSuccess && !listing.isFetching && listing.data)
      recordRecentlyViewed(cache, listing.data.branchId);
  }, [cache, listing.isSuccess, listing.isFetching, listing.data]);
  const link = {
    color: colors.primary,
    minHeight: metrics.touch,
    display: 'inline-flex',
    alignItems: 'center',
  };
  return (
    <div className="customer-backdrop min-h-screen">
      <PublicHeader />
      <main
        id="main"
        className="mx-auto max-w-5xl"
        style={{
          color: colors.heading,
          padding: metrics.xxl,
          display: 'grid',
          gap: metrics.lg,
          alignContent: 'start',
        }}
      >
        <Link href="/" style={link}>
          Back to hostels
        </Link>
        {listing.isPending ? (
          <div className="customer-skeleton h-64" role="status" aria-label="Loading hostel" />
        ) : null}
        {listing.isError ? (
          <div>
            <p role="alert">{errorMessage(listing.error)}</p>
            <button
              type="button"
              style={link}
              onClick={() => {
                void listing.refetch();
              }}
            >
              Try again
            </button>
          </div>
        ) : null}
        {listing.data && !listing.isError ? (
          <>
            <h1 style={{ fontSize: metrics.headingSize }}>{listing.data.name}</h1>
            <p style={{ color: colors.primary }}>Verified property</p>
            <SaveHostelAction branchId={branchId} />
            <ShareHostel key={branchId} branchId={branchId} />
            <VisitRequest branchId={branchId} slug={listing.data.slug} />
            <WaitlistJoin branchId={branchId} />
            <ChatStart branchId={branchId} />
            <p>{listing.data.address}</p>
            <PublicGallery key={'gallery:' + branchId} branchId={branchId} />
            <PublicInventoryOptions key={'options:' + branchId} branchId={branchId} />
            <PublicListingRules key={'rules:' + branchId} branchId={branchId} />
            <PublicServices key={'services:' + branchId} branchId={branchId} />
            {listing.data.description ? <p>{listing.data.description}</p> : null}
            {listing.data.publicPhone ? <p>{listing.data.publicPhone}</p> : null}
            {listing.data.publicEmail ? <p>{listing.data.publicEmail}</p> : null}
            <Link href={authenticationPath('login', `/hostels/${branchId}`)} style={link}>
              Sign in to book
            </Link>
          </>
        ) : null}
      </main>
      <PublicFooter />
    </div>
  );
}
