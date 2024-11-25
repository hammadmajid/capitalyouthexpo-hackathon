import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MarketplaceHero } from './marketplace-hero';
afterEach(cleanup);
it('ACC-002: Home marketing stays explicitly illustrative and separate from actual property cards', () => {
  const { container } = render(<MarketplaceHero />);
  expect(screen.getByRole('heading', { name: 'Find Your Perfect Hostel' })).toBeDefined();
  expect(screen.getByText('Illustrative image')).toBeDefined();
  expect(screen.queryByText('Verified property')).toBeNull();
  expect(container.querySelector('img')?.getAttribute('src')).toContain('marketplace-hero.png');
  expect(container.querySelectorAll('article')).toHaveLength(0);
});
it('ACC-002: failed marketing artwork retains live headline, guidance and truthful fallback', () => {
  const { container } = render(<MarketplaceHero />);
  const image = container.querySelector('img');
  if (!image) throw new Error('Missing local illustration');
  fireEvent.error(image);
  expect(container.querySelector('img')).toBeNull();
  expect(screen.getByText('Illustration unavailable.')).toBeDefined();
  expect(screen.getByRole('heading', { name: 'Find Your Perfect Hostel' })).toBeDefined();
  expect(screen.getByText('Safe. Comfortable. Near Your University.')).toBeDefined();
});
