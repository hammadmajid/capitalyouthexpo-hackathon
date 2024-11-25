import { useState } from 'react';
import Image from 'next/image';
import { marketplaceColors as colors, marketplaceMetrics as metrics } from '@hsm/ui';
export function MarketplaceHero() {
  const [failed, setFailed] = useState(false);
  return (
    <section
      aria-label="Find your hostel"
      style={{
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: colors.hero,
        color: colors.heroText,
        padding: metrics.section,
        borderRadius: metrics.large,
        minHeight: metrics.heroHeight,
      }}
    >
      {!failed ? (
        <Image
          src="/assets/marketplace-hero.png"
          alt=""
          aria-hidden
          fill
          sizes="(max-width: 600px) 100vw, 1200px"
          priority
          style={{ objectFit: 'cover' }}
          onError={() => setFailed(true)}
        />
      ) : null}
      <div
        aria-hidden
        style={{ position: 'absolute', inset: 0, backgroundColor: colors.heroScrim }}
      />
      <div style={{ position: 'relative', display: 'grid', gap: metrics.lg }}>
        <h1 style={{ fontSize: metrics.heroTitleSize, fontWeight: 700 }}>
          Find Your <br />
          Perfect Hostel
        </h1>
        <p>Safe. Comfortable. Near Your University.</p>
        <p>Verified properties · Student friendly · Islamabad and Rawalpindi</p>
        <p>{failed ? 'Illustration unavailable.' : 'Illustrative image'}</p>
      </div>
    </section>
  );
}
