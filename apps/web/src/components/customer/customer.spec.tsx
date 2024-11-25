import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  readCustomerStayReceipt,
  readOwnFileUrl,
  readOwnResidentLinkStatus,
} from '@hsm/api-client';
import PrivacyPage from '../../app/privacy/page';
import TermsPage from '../../app/terms/page';
import { OwnLinkStatus } from './own-link-status';
import { OwnPhoto } from './own-photo';
import { OwnReceipt } from './own-receipt';
vi.mock('../../lib/client', () => ({ browserClient: () => ({}) }));
vi.mock('../public-header', () => ({ PublicHeader: () => null }));
vi.mock('../public-footer', () => ({ PublicFooter: () => null }));
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  readCustomerStayReceipt: vi.fn(),
  readOwnResidentLinkStatus: vi.fn(),
  readOwnFileUrl: vi.fn(),
}));
const stayId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  receiptId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  fileId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
function wrap(node: React.ReactNode) {
  render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);
}
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
it('PAY-008: a resident opens the receipt the hostel issued, including a later reversal', async () => {
  vi.mocked(readCustomerStayReceipt).mockResolvedValue({
    receiptId,
    receiptNumber: 'RCPT-7',
    issuedAt: '2026-11-02T10:00:00.000Z',
    reversed: true,
    snapshot: {
      amountPaisa: 1500000,
      hostelName: 'Saved hostel',
      paidOn: '2026-11-01',
      distribution: { depositPaisa: 500000, allocatedPaisa: 1000000 },
    },
  } as never);
  const user = userEvent.setup();
  wrap(<OwnReceipt actorId="resident" stayId={stayId} receiptId={receiptId} />);
  expect(readCustomerStayReceipt).not.toHaveBeenCalled();
  expect(screen.getByRole('link', { name: 'Download receipt PDF' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'View receipt' }));
  expect(await screen.findByText('Receipt RCPT-7')).toBeTruthy();
  expect(screen.getByText(/received by Saved hostel on 2026-11-01/)).toBeTruthy();
  expect(screen.getByText('Security deposit: PKR 5,000')).toBeTruthy();
  expect(screen.getByRole('alert').textContent).toBe('This payment was reversed by the hostel.');
  expect(readCustomerStayReceipt).toHaveBeenCalledWith({}, stayId, receiptId);
});
it('CHG-009: a pending resident link says the stay appears after the hostel approves it', async () => {
  vi.mocked(readOwnResidentLinkStatus).mockResolvedValue({ pending: true });
  wrap(<OwnLinkStatus actorId="customer" />);
  expect(await screen.findByText(/Your hostel is confirming your account/)).toBeTruthy();
  cleanup();
  vi.mocked(readOwnResidentLinkStatus).mockResolvedValue({ pending: false });
  wrap(<OwnLinkStatus actorId="customer-2" />);
  await waitFor(() => expect(readOwnResidentLinkStatus).toHaveBeenCalledTimes(2));
  expect(screen.queryByText(/Your hostel is confirming your account/)).toBeNull();
});
it('the current profile photo loads through a signed URL, and only when one is saved', async () => {
  vi.mocked(readOwnFileUrl).mockResolvedValue({ url: 'https://files.test/me.jpg' } as never);
  wrap(<OwnPhoto userId="me" fileId={null} />);
  expect(screen.getByRole('img', { name: 'No profile photo' })).toBeTruthy();
  expect(readOwnFileUrl).not.toHaveBeenCalled();
  cleanup();
  wrap(<OwnPhoto userId="me" fileId={fileId} />);
  expect(await screen.findByAltText('Profile photo')).toBeTruthy();
  expect(readOwnFileUrl).toHaveBeenCalledWith({}, fileId);
});
it('BR-01 / BR-05: privacy and terms pages repeat the direct-payment and disclosure promises', () => {
  render(<PrivacyPage />);
  expect(screen.getByText(/never show residents’ identities or rent status/)).toBeTruthy();
  cleanup();
  render(<TermsPage />);
  expect(screen.getByText(/we never hold your money/)).toBeTruthy();
});
