import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReportDownloads } from './dashboards';

const OriginalURL = URL;
const create = vi.fn(() => 'blob:synthetic-report');
const revoke = vi.fn();
const fetchReport = vi.fn<typeof fetch>();
const downloadedNames: string[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  downloadedNames.length = 0;
  vi.stubGlobal('fetch', fetchReport);
  vi.stubGlobal(
    'URL',
    Object.assign(class extends OriginalURL {}, {
      createObjectURL: create,
      revokeObjectURL: revoke,
    }),
  );
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloadedNames.push(this.download);
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function download() {
  const link = screen.getAllByRole('link', { name: 'CSV' })[0];
  if (!link) throw new Error('CSV link missing');
  link.addEventListener('click', (event) => event.preventDefault());
  fireEvent.click(link);
}
it('RPT-001 / AUD-010: an inverted report period displays validation without creating download links', () => {
  render(<ReportDownloads />);
  fireEvent.change(screen.getByLabelText('Report from'), { target: { value: '2026-06-30' } });
  fireEvent.change(screen.getByLabelText('Report to'), { target: { value: '2026-06-25' } });
  expect(screen.getByRole('alert').textContent).toMatch(/from.*before|to.*after|date.*range/i);
  expect(screen.queryAllByRole('link')).toHaveLength(0);
  expect(fetchReport).not.toHaveBeenCalled();
});
it('RPT-002 / AUD-007: truncated download displays an explicit warning and retains authenticated scope', async () => {
  fetchReport.mockResolvedValue(
    new Response('"Resident"\r\n"Synthetic"\r\n', {
      headers: {
        'content-type': 'text/csv',
        'content-disposition': 'attachment; filename="hsm-occupancy-2026-06-25.csv"',
        'x-hsm-report-truncated': 'true',
      },
    }),
  );
  render(<ReportDownloads branchId="10000000-0000-4000-8000-000000000001" />);
  download();
  await waitFor(() => expect(fetchReport).toHaveBeenCalled());
  expect(fetchReport.mock.calls[0]?.[0]).toBe(
    '/api/v1/branches/10000000-0000-4000-8000-000000000001/reports/occupancy?format=csv',
  );
  expect((await screen.findByRole('alert')).textContent).toMatch(/first 5,000|first 5000/i);
  expect(create).toHaveBeenCalledTimes(1);
  expect(downloadedNames).toEqual(['hsm-occupancy-2026-06-25.csv']);
  expect(fetchReport.mock.calls[0]?.[1]).toMatchObject({
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'error',
  });
});
it('RPT-002 / AUD-007: complete download does not claim truncation and releases its blob URL', async () => {
  fetchReport.mockResolvedValue(
    new Response('"Resident"\r\n', { headers: { 'x-hsm-report-truncated': 'false' } }),
  );
  const view = render(<ReportDownloads />);
  download();
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('alert')).toBeNull();
  view.unmount();
  expect(revoke).toHaveBeenCalledWith('blob:synthetic-report');
});
it('RPT-002 / AUD-007: missing completeness metadata is disclosed instead of silently assumed complete', async () => {
  fetchReport.mockResolvedValue(new Response('"Resident"\r\n'));
  render(<ReportDownloads />);
  download();
  expect((await screen.findByRole('alert')).textContent).toMatch(
    /completeness.*confirm|confirm.*completeness/i,
  );
});
it('RPT-002 / SEC-003 / AUD-007: failed authorization does not download an error body as CSV', async () => {
  fetchReport.mockResolvedValue(new Response('{"code":"FORBIDDEN"}', { status: 403 }));
  render(<ReportDownloads />);
  download();
  expect((await screen.findByRole('alert')).textContent).toMatch(/download/i);
  expect(create).not.toHaveBeenCalled();
});
it('RPT-002 / AUD-007: repeated clicks share one request and unmount aborts the unfinished download', async () => {
  let respond: ((response: Response) => void) | undefined;
  fetchReport.mockImplementation(
    () =>
      new Promise<Response>((resolve) => {
        respond = resolve;
      }),
  );
  const view = render(<ReportDownloads />);
  download();
  download();
  expect(fetchReport).toHaveBeenCalledTimes(1);
  const signal = fetchReport.mock.calls[0]?.[1]?.signal;
  expect(signal?.aborted).toBe(false);
  view.unmount();
  expect(signal?.aborted).toBe(true);
  if (!respond) throw new Error('Request not started');
  await act(async () => {
    respond?.(new Response('synthetic CSV', { headers: { 'x-hsm-report-truncated': 'false' } }));
  });
  expect(create).not.toHaveBeenCalled();
});
