import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { requestBookingQuote } from '@hsm/api-client';
import { MarketplaceQuote } from './marketplace-quote';
import { checkoutQuote as quote, checkoutBranchId as branchId } from './checkout.fixture';
const { capture } = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  requestBookingQuote: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
vi.mock('./marketplace-checkout-gate', () => ({
  MarketplaceCheckoutGate: (props: { onBusy: (value: boolean) => void }) => {
    capture(props);
    return <button onClick={() => props.onBusy(true)}>Pending checkout fixture</button>;
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requestBookingQuote).mockResolvedValue(quote);
});
afterEach(cleanup);
function show(initialRange?: typeof quote.range) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MarketplaceQuote
        branchId={branchId}
        target={quote.target}
        {...(initialRange ? { initialRange } : {})}
      />
    </QueryClientProvider>,
  );
}
function dates() {
  fireEvent.change(screen.getByLabelText('Move-in date'), {
    target: { value: quote.range.moveInDate },
  });
  fireEvent.change(screen.getByLabelText('Move-out date'), {
    target: { value: quote.range.moveOutDate },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Check availability and terms' }));
}
it('BKG-001: invalid dates cannot obtain a quote or mount private checkout', () => {
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Check availability and terms' }));
  expect(screen.getByRole('alert')).toBeDefined();
  expect(requestBookingQuote).not.toHaveBeenCalled();
  expect(capture).not.toHaveBeenCalled();
});
it('BKG-004: only actual quote results mount checkout with exact branch and agreed snapshot', async () => {
  show();
  dates();
  await screen.findByText('Current booking terms');
  expect(capture).toHaveBeenLastCalledWith(expect.objectContaining({ branchId, quote }));
  expect(screen.getByText(/Monthly rent/).textContent).toContain('18,000.01');
  expect(
    screen.getByText('Requesting a quote alone does not hold inventory or create a booking.'),
  ).toBeDefined();
});
it('BKG-001: an in-flight checkout prevents changing quote dates or replacing agreed terms', async () => {
  show();
  dates();
  fireEvent.click(await screen.findByRole('button', { name: 'Pending checkout fixture' }));
  expect((screen.getByLabelText('Move-in date') as HTMLInputElement).disabled).toBe(true);
  expect(
    (screen.getByRole('button', { name: 'Check availability and terms' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.change(screen.getByLabelText('Move-in date'), { target: { value: '2026-10-21' } });
  expect((screen.getByLabelText('Move-in date') as HTMLInputElement).value).toBe(
    quote.range.moveInDate,
  );
});

it('BKG-001 / P2-S1: applied page dates initialize the real quote request without changing its target', async () => {
  show(quote.range);
  expect(screen.getByLabelText('Move-in date')).toHaveProperty('value', quote.range.moveInDate);
  expect(screen.getByLabelText('Move-out date')).toHaveProperty('value', quote.range.moveOutDate);
  expect(requestBookingQuote).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Check availability and terms' }));
  await screen.findByText('Current booking terms');
  expect(requestBookingQuote).toHaveBeenCalledWith({}, branchId, {
    target: quote.target,
    range: quote.range,
  });
});

it('SERV-002 / BKG-004: optional transport requotes before checkout uses the selection', async () => {
  const offered = {
    ...quote,
    transportOffer: { routeId: branchId, name: 'University', monthlyChargePaisa: 300000 },
  };
  vi.mocked(requestBookingQuote)
    .mockResolvedValueOnce(offered)
    .mockResolvedValueOnce({ ...offered, transportRequested: true });
  show(quote.range);
  fireEvent.click(screen.getByRole('button', { name: 'Check availability and terms' }));
  fireEvent.click(await screen.findByRole('checkbox', { name: /Add transport/ }));
  await screen.findByText('Current booking terms');
  expect(requestBookingQuote).toHaveBeenLastCalledWith({}, branchId, {
    target: quote.target,
    range: quote.range,
    transportRequested: true,
  });
  expect(capture).toHaveBeenLastCalledWith(
    expect.objectContaining({ quote: { ...offered, transportRequested: true } }),
  );
});
