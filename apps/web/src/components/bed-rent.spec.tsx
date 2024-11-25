import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readBedRent, scheduleBedRent } from '@hsm/api-client';
import { BedRent } from './bed-rent';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  readBedRent: vi.fn(),
  scheduleBedRent: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
const branchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  roomId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  bedId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
function page(
  canEdit: boolean,
  current: { monthlyRentPaisa: number; depositPaisa?: number } | null,
) {
  vi.mocked(readBedRent).mockResolvedValue({
    branchId,
    roomId,
    bedId,
    bedLabel: 'Bed A',
    canEdit,
    current: current && { ...current, priceVersionId: null, effectiveFrom: null },
    data: [],
    nextCursor: null,
  } as never);
}
function show() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <BedRent actorId="actor" branchId={branchId} bedId={bedId} />
    </QueryClientProvider>,
  );
}
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
it('CHG-056: shows this bed’s own rent and security', async () => {
  page(false, { monthlyRentPaisa: 1_500_000, depositPaisa: 500_000 });
  show();
  expect(await screen.findByText(/Bed A/)).toBeTruthy();
  expect(screen.getByText(/15,000/)).toBeTruthy();
  expect(screen.getByText(/Security .*5,000/)).toBeTruthy();
});
it('CHG-056: hides the editor when the server denies editing', async () => {
  page(false, null);
  show();
  expect(await screen.findByText(/Rent not set/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Edit rent/ })).toBeNull();
});
it('CHG-058 / BKG-003: saves dated rent and security as integer paisa', async () => {
  page(true, { monthlyRentPaisa: 1_500_000, depositPaisa: 0 });
  vi.mocked(scheduleBedRent).mockResolvedValue({} as never);
  show();
  fireEvent.click(await screen.findByRole('button', { name: /Edit rent & security/ }));
  const rent = screen.getByLabelText<HTMLInputElement>('Monthly rent for this bed (PKR)');
  expect(rent.value).toBe('15,000.00');
  fireEvent.change(rent, { target: { value: '18,500' } });
  fireEvent.change(screen.getByLabelText('Security deposit for this bed (PKR)'), {
    target: { value: '10000' },
  });
  fireEvent.change(screen.getByLabelText('Effective from'), { target: { value: '2026-12-01' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save pricing' }));
  await waitFor(() => expect(scheduleBedRent).toHaveBeenCalledTimes(1));
  const [, sentBranch, sentBed, body, key] = vi.mocked(scheduleBedRent).mock.calls[0] ?? [];
  expect([sentBranch, sentBed]).toEqual([branchId, bedId]);
  expect(body).toEqual({
    monthlyRentPaisa: 1_850_000,
    depositPaisa: 1_000_000,
    effectiveFrom: '2026-12-01',
  });
  expect(typeof key).toBe('string');
});
it('CHG-056: rejects a non-numeric amount without sending', async () => {
  page(true, null);
  show();
  fireEvent.click(await screen.findByRole('button', { name: /Edit rent & security/ }));
  fireEvent.change(screen.getByLabelText('Monthly rent for this bed (PKR)'), {
    target: { value: '12.345' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save pricing' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(scheduleBedRent).not.toHaveBeenCalled();
});
