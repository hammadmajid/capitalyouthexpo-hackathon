import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { marketplacePrice, type listMarketplace } from '@hsm/api-client';
import { marketplaceColors as colors, marketplaceMetrics as metrics } from '@hsm/ui';
type Listing = Awaited<ReturnType<typeof listMarketplace>>['data'][number];
export function RecentHostelCard({ listing }: { listing: Listing }) {
  const [failed, setFailed] = useState(false),
    photo = listing.media[0];
  return (
    <article
      style={{
        display: 'flex',
        gap: metrics.md,
        padding: metrics.md,
        borderRadius: metrics.card,
        border: `1px solid ${colors.border}`,
        backgroundColor: colors.surface,
      }}
    >
      {photo && !failed ? (
        <Image
          unoptimized
          src={'/api/v1/marketplace/media/' + photo.id}
          alt={photo.altText}
          width={metrics.navigationHeight}
          height={metrics.navigationHeight}
          style={{ objectFit: 'cover', borderRadius: metrics.sm }}
          onError={() => setFailed(true)}
        />
      ) : (
        <p style={{ color: colors.secondary }}>Property photo unavailable</p>
      )}
      <div style={{ display: 'grid', gap: metrics.sm }}>
        <h3>
          <Link href={'/hostels/' + listing.branchId} style={{ color: colors.primary }}>
            {listing.name}
          </Link>
        </h3>
        <p style={{ color: colors.secondary }}>
          {[listing.area, listing.city].filter(Boolean).join(', ')}
        </p>
        <p>
          {listing.priceFromPaisa === null
            ? 'Pricing unavailable'
            : 'From ' + marketplacePrice(listing.priceFromPaisa) + ' / month'}
        </p>
      </div>
    </article>
  );
}
