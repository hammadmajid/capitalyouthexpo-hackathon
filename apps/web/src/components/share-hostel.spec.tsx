import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ShareHostel } from './share-hostel';
import { branchId } from '../../test/unit/public-summary.fixture';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('p.14 / SEC-003: browser shares only the canonical public link', async () => {
  const share = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { share });
  render(<ShareHostel branchId={branchId} />);
  fireEvent.click(screen.getByRole('button', { name: 'Share hostel with family' }));
  await waitFor(() =>
    expect(share).toHaveBeenCalledWith({
      title: 'HSM hostel summary',
      url: window.location.origin + '/share/' + branchId,
    }),
  );
  expect(screen.getByRole('link', { name: 'Public family summary' }).getAttribute('href')).toBe(
    '/share/' + branchId,
  );
});
it('p.14: browser without native sharing copies the public URL and recovers from failures', async () => {
  const writeText = vi
    .fn()
    .mockRejectedValueOnce(new Error('Unavailable'))
    .mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  render(<ShareHostel branchId={branchId} />);
  fireEvent.click(screen.getByRole('button', { name: 'Share hostel with family' }));
  await screen.findByText(/Sharing unavailable/);
  fireEvent.click(screen.getByRole('button', { name: 'Share hostel with family' }));
  await screen.findByText('Public summary link copied.');
  expect(writeText).toHaveBeenLastCalledWith(window.location.origin + '/share/' + branchId);
});
