import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ApiFailure } from '@hsm/api-client';
import SharePage, { generateMetadata } from './page';
import { loadPublicHostelSummary } from '../../../server/public-summary';
import { branchId, summary } from '../../../../test/unit/public-summary.fixture';
vi.mock('../../../server/public-summary', () => ({ loadPublicHostelSummary: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
const props = () => ({ params: Promise.resolve({ branchId }), searchParams: Promise.resolve({}) });
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});
it('p.14 / SEC-003: actual share route emits public summary HTML and a clean canonical URL', async () => {
  vi.stubEnv('WEB_ORIGIN', 'https://web.example.test');
  vi.mocked(loadPublicHostelSummary).mockResolvedValue(summary);
  const html = renderToStaticMarkup(await SharePage(props()));
  expect(html).toContain('PKR 18,000.01');
  expect(html).toContain('Published house rule');
  expect(loadPublicHostelSummary).toHaveBeenCalledWith(branchId, {});
  expect(await generateMetadata(props())).toMatchObject({
    alternates: { canonical: 'https://web.example.test/share/' + branchId },
  });
});
it('SEC-003: malformed branch and private query fields fail without any summary request', async () => {
  await expect(
    SharePage({ ...props(), params: Promise.resolve({ branchId: 'invalid' }) }),
  ).rejects.toThrow('NOT_FOUND');
  await expect(
    SharePage({ ...props(), searchParams: Promise.resolve({ customerId: 'PRIVATE' }) }),
  ).rejects.toThrow('NOT_FOUND');
  expect(loadPublicHostelSummary).not.toHaveBeenCalled();
});
it('SEC-003: unapproved/not-public API results become404; outages disclose no private errors or stale facts', async () => {
  vi.mocked(loadPublicHostelSummary).mockRejectedValueOnce(
    new ApiFailure({
      type: 'about:blank',
      title: 'Unavailable',
      detail: 'Unavailable',
      status: 404,
      code: 'NOT_FOUND',
      traceId: 'fixture',
    }),
  );
  await expect(SharePage(props())).rejects.toThrow('NOT_FOUND');
  vi.mocked(loadPublicHostelSummary).mockRejectedValueOnce(new Error('PRIVATE backend marker'));
  const html = renderToStaticMarkup(await SharePage(props()));
  expect(html).toContain('Hostel summary unavailable');
  expect(html).not.toContain('PRIVATE');
  expect(html).not.toContain('Public branch');
});
