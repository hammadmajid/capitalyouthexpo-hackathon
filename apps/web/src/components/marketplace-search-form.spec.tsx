import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MarketplaceSearchForm } from './marketplace-search-form';
afterEach(cleanup);
it('ACC-002: actual filter form sends validated category, exact money and dates', () => {
  const onApply = vi.fn();
  render(<MarketplaceSearchForm initial={{ limit: 20 }} onApply={onApply} />);
  fireEvent.change(screen.getByLabelText('Hostel, university or area'), {
    target: { value: ' H-13 ' },
  });
  fireEvent.change(screen.getByLabelText('Hostel category'), { target: { value: 'boys' } });
  fireEvent.change(screen.getByLabelText('Minimum monthly rent (PKR)'), {
    target: { value: '18000.01' },
  });
  fireEvent.change(screen.getByLabelText('Maximum monthly rent (PKR)'), {
    target: { value: '20000' },
  });
  fireEvent.change(screen.getByLabelText('Move-in date'), { target: { value: '2026-11-01' } });
  fireEvent.change(screen.getByLabelText('Move-out date'), { target: { value: '2026-11-03' } });
  fireEvent.click(screen.getByLabelText('Only available for these dates'));
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  expect(onApply).toHaveBeenCalledWith({
    q: 'H-13',
    category: 'boys',
    minimumRentPaisa: 1800001,
    maximumRentPaisa: 2000000,
    moveInDate: '2026-11-01',
    moveOutDate: '2026-11-03',
    availableOnly: true,
    limit: 20,
  });
});
it('ACC-002: availability without dates fails locally and keeps entered filters', () => {
  const onApply = vi.fn();
  render(<MarketplaceSearchForm initial={{ q: 'Hostel', limit: 20 }} onApply={onApply} />);
  fireEvent.click(screen.getByLabelText('Only available for these dates'));
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  expect(screen.getByRole('alert')).toBeDefined();
  expect(onApply).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Hostel, university or area')).toHaveProperty('value', 'Hostel');
});
it('ACC-002: saved exact rent and university scope are retained on applying other filters', () => {
  const onApply = vi.fn(),
    universityPlaceId = randomUUID();
  render(
    <MarketplaceSearchForm
      initial={{
        minimumRentPaisa: 1800001,
        maximumRentPaisa: 2000099,
        universityPlaceId,
        radiusMeters: 5000,
        category: 'girls',
        moveInDate: '2026-11-01',
        moveOutDate: '2026-11-03',
        availableOnly: true,
      }}
      onApply={onApply}
    />,
  );
  expect(screen.getByLabelText('Minimum monthly rent (PKR)')).toHaveProperty('value', '18000.01');
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  expect(onApply).toHaveBeenCalledWith(
    expect.objectContaining({
      universityPlaceId,
      radiusMeters: 5000,
      minimumRentPaisa: 1800001,
      maximumRentPaisa: 2000099,
      category: 'girls',
      availableOnly: true,
    }),
  );
});
it('ACC-002: clearing filters removes university and cursor as well as visible fields', () => {
  const onApply = vi.fn();
  render(
    <MarketplaceSearchForm
      initial={{
        q: 'Old',
        universityPlaceId: randomUUID(),
        radiusMeters: 5000,
        cursor: randomUUID(),
      }}
      onApply={onApply}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(onApply).toHaveBeenCalledWith({ limit: 20 });
  expect(screen.getByLabelText('Hostel, university or area')).toHaveProperty('value', '');
});
