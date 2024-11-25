'use client';
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ShieldCheck, MapPin } from 'lucide-react';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { MarketplaceMap } from './marketplace-map';
import { RecentlyViewed } from './recently-viewed';
import { HostelComparison } from './hostel-comparison';
import { MarketplaceSearchForm } from './marketplace-search-form';
import { PublicHeader } from './public-header';
import { PublicFooter } from './public-footer';
import { listMarketplace, marketplaceInstitutions, marketplacePrice } from '@hsm/api-client';
import { mobileMarketplaceColors as colors, marketplaceMetrics as metrics } from '@hsm/ui';
import type { MarketplaceQuery } from '@hsm/contracts';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
export function MarketplaceHome() {
  const [query, setQuery] = useState<Partial<MarketplaceQuery>>({ limit: 20 });
  const listings = useInfiniteQuery({
    queryKey: ['marketplace', query],
    initialPageParam: null,
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      listMarketplace(browserClient(), { ...query, ...(pageParam ? { cursor: pageParam } : {}) }),
    getNextPageParam: (page) => page.nextCursor,
  });
  const institutions = useQuery({
    queryKey: ['marketplace-institutions', 5000],
    queryFn: () => marketplaceInstitutions(browserClient(), { limit: 20, radiusMeters: 5000 }),
  });
  const link = {
    color: colors.primary,
    minHeight: metrics.touch,
    display: 'inline-flex',
    alignItems: 'center',
  };
  return (
    <div
      className="customer-backdrop"
      style={{ minHeight: '100vh', backgroundColor: colors.background, color: colors.heading }}
    >
      <PublicHeader />
      <main
        id="main"
        style={{
          maxWidth: metrics.contentMaxWidth * 2,
          margin: '0 auto',
          padding: metrics.xxl,
          display: 'grid',
          gap: metrics.xxl,
        }}
      >
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Find hostels</h1>
        <MarketplaceSearchForm key={JSON.stringify(query)} initial={query} onApply={setQuery} />
        <h2 style={{ fontSize: metrics.headingSize }}>Featured Hostels</h2>
        {listings.isPending ? (
          <div className="customer-skeleton h-56" role="status" aria-label="Loading hostels" />
        ) : null}
        {listings.isError ? (
          <div>
            <p role="alert">{errorMessage(listings.error)}</p>
            <button
              type="button"
              onClick={() => {
                void listings.refetch();
              }}
              style={link}
            >
              Try again
            </button>
          </div>
        ) : null}
        {listings.data?.pages.every((page) => page.data.length === 0) ? (
          <p>No matching hostels.</p>
        ) : null}
        <div
          style={{
            display: 'grid',
            gap: metrics.lg,
            gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${metrics.heroHeight}px), 1fr))`,
          }}
        >
          {listings.data?.pages
            .flatMap((page) => page.data)
            .map((listing) => (
              <article
                className="customer-frost"
                key={listing.branchId}
                style={{
                  borderRadius: metrics.large,
                  border: `1px solid ${colors.border}`,
                  overflow: 'hidden',
                }}
              >
                {listing.media[0] ? (
                  <Image
                    unoptimized
                    src={`/api/v1/marketplace/media/${listing.media[0].id}`}
                    alt={listing.media[0].altText}
                    width={metrics.contentMaxWidth}
                    height={metrics.heroHeight}
                    style={{ width: '100%', height: metrics.heroHeight, objectFit: 'cover' }}
                  />
                ) : (
                  <p
                    style={{
                      backgroundColor: colors.sage,
                      minHeight: metrics.heroHeight,
                      padding: metrics.lg,
                    }}
                  >
                    Property photo unavailable
                  </p>
                )}
                <div style={{ padding: metrics.lg }}>
                  <p style={{ color: colors.primary }}>
                    <ShieldCheck aria-hidden size={metrics.iconSize} /> Verified
                  </p>
                  <h3>
                    <Link href={`/hostels/${listing.branchId}`} style={link}>
                      {listing.name}
                    </Link>
                  </h3>
                  <p>
                    <MapPin aria-hidden size={metrics.iconSize} />{' '}
                    {[listing.area, listing.city].filter(Boolean).join(', ')}
                  </p>
                  <p style={{ color: colors.primary, fontWeight: 700 }}>
                    {listing.priceFromPaisa === null
                      ? 'Pricing unavailable'
                      : `From ${marketplacePrice(listing.priceFromPaisa)} / month`}
                  </p>
                  <p>{listing.amenities.map((amenity) => amenity.name).join(' · ')}</p>
                </div>
              </article>
            ))}
        </div>
        {listings.hasNextPage ? (
          <button
            type="button"
            style={link}
            disabled={listings.isFetchingNextPage}
            onClick={() => void listings.fetchNextPage()}
          >
            More hostels
          </button>
        ) : null}
        <MarketplaceMap
          listings={listings.data?.pages.flatMap((page) => page.data) ?? []}
          disabled={listings.isFetching}
          onSearch={(bounds) =>
            setQuery((current) => ({ ...current, ...bounds, cursor: undefined }))
          }
        />
        {institutions.data?.data.length ? (
          <h2 style={{ fontSize: metrics.headingSize }}>Hostels within 5 km of campus</h2>
        ) : null}
        <HostelComparison
          listings={listings.data?.pages.flatMap((page) => page.data) ?? []}
          institutions={institutions.data?.data ?? []}
          unavailable={listings.isError || listings.isFetching}
        />
        {institutions.isPending ? <p role="status">Loading universities…</p> : null}
        {institutions.isError ? <p role="alert">{errorMessage(institutions.error)}</p> : null}
        <div style={{ display: 'flex', gap: metrics.lg, flexWrap: 'wrap' }}>
          {institutions.data?.data.map((institution) => (
            <button
              key={institution.id}
              type="button"
              style={{
                ...link,
                padding: metrics.lg,
                border: `1px solid ${colors.border}`,
                borderRadius: metrics.card,
              }}
              onClick={() =>
                setQuery({ universityPlaceId: institution.id, radiusMeters: 5000, limit: 20 })
              }
            >
              {institution.shortName ?? institution.name} · {institution.hostelCount} hostels
            </button>
          ))}
        </div>
        <RecentlyViewed />
      </main>
      <PublicFooter />
    </div>
  );
}
