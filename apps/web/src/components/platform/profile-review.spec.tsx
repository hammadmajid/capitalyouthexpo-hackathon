import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as sdk from '@hsm/api-client';
import { ProfileReviewCase } from './profile-review-case';
import { OwnProfileReviews } from './own-profile-reviews';
const mocks = vi.hoisted(() => [
  'accessProfileReview',
  'accessProfileReviewEvidence',
  'decideProfileReview',
  'readProfileReviewHistory',
  'listProfileReviews',
  'listProfilePhotoSubjects',
  'submitProfileReview',
]);
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  ...Object.fromEntries(mocks.map((name) => [name, vi.fn()])),
}));
vi.mock('./admin-operations', async (original) => ({
  ...(await original<typeof import('./admin-operations')>()),
  useOperationScope: (actorId: string, module: string) => ({
    key: ['platform-admin-web', actorId, module],
    read: async (work: (client: object) => Promise<unknown>) => work({}),
  }),
}));
vi.mock('../private-file-input', () => ({
  PrivateFileInput: ({ label, onReady }: { label: string; onReady: (id: string) => void }) => (
    <button onClick={() => onReady(fileId)}>{label}</button>
  ),
}));
const id = '10000000-0000-4000-8000-000000000001',
  actor = '10000000-0000-4000-8000-000000000002',
  fileId = '10000000-0000-4000-8000-000000000003',
  at = '2026-10-30T16:00:00.000Z';
const review = {
  id,
  userId: actor,
  kind: 'identity' as const,
  status: 'pending' as const,
  version: 1,
  submittedAt: at,
  updatedAt: at,
};
const detail = {
  review,
  reason: 'Documented legal identity correction',
  previousFullName: 'Previous private identity',
  proposedFullName: 'Corrected private identity',
  previousCnicLast4: '1234',
  proposedCnic: '1234512345671',
  previousPhotoFileId: null,
  proposedPhotoFileId: null,
  currentPhoto: false,
  evidenceFileIds: [fileId],
};
function show(node: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false, gcTime: 0 },
          },
        })
      }
    >
      {node}
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(sdk.accessProfileReview).mockReset().mockResolvedValue(detail);
  vi.mocked(sdk.decideProfileReview)
    .mockReset()
    .mockResolvedValue({ ...review, version: 2, status: 'approved' });
  vi.mocked(sdk.readProfileReviewHistory).mockResolvedValue({ data: [], nextCursor: null });
  vi.mocked(sdk.listProfileReviews).mockResolvedValue({ data: [], nextCursor: null });
  vi.mocked(sdk.listProfilePhotoSubjects).mockResolvedValue({ data: [], nextCursor: null });
  vi.mocked(sdk.submitProfileReview).mockResolvedValue(review);
});
afterEach(cleanup);
async function access() {
  fireEvent.change(screen.getByLabelText('Profile review access purpose'), {
    target: { value: 'Verify submitted identity documents' },
  });
  fireEvent.click(screen.getByText('Access private review details'));
  await screen.findByText('Corrected private identity');
}
it('HMA-015: private review access and approval need a purpose, reason and explicit current-revision confirmation', async () => {
  show(<ProfileReviewCase actorId={actor} kind="identity" id={id} close={vi.fn()} />);
  expect(sdk.accessProfileReview).not.toHaveBeenCalled();
  expect(screen.queryByText(detail.proposedCnic)).toBeNull();
  await access();
  expect(sdk.accessProfileReview).toHaveBeenCalledWith(
    expect.anything(),
    'identity',
    id,
    { justification: 'Verify submitted identity documents' },
    false,
  );
  fireEvent.change(screen.getByLabelText('Profile review decision reason'), {
    target: { value: 'Reviewed documents match the legal correction' },
  });
  fireEvent.click(screen.getByText('approve profile review'));
  expect(sdk.decideProfileReview).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Confirm profile review decision'));
  await waitFor(() =>
    expect(sdk.decideProfileReview).toHaveBeenCalledWith(
      expect.anything(),
      'identity',
      id,
      {
        action: 'approve',
        expectedVersion: 1,
        reason: 'Reviewed documents match the legal correction',
      },
      expect.any(String),
      false,
    ),
  );
});
it('HMA-015 SEC-003: private details and late responses disappear on focus loss', async () => {
  let resolve: ((value: typeof detail) => void) | undefined;
  vi.mocked(sdk.accessProfileReview).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  show(<ProfileReviewCase actorId={actor} kind="identity" id={id} close={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Profile review access purpose'), {
    target: { value: 'Verify submitted identity documents' },
  });
  fireEvent.click(screen.getByText('Access private review details'));
  await waitFor(() => expect(resolve).toBeDefined());
  fireEvent(window, new Event('blur'));
  await act(async () => {
    resolve?.(detail);
  });
  expect(screen.queryByText(detail.proposedCnic)).toBeNull();
  expect(screen.queryByText('Corrected private identity')).toBeNull();
});
it('HMA-015 AUD-003: uncertain decision recovery remains available after private details are cleared', async () => {
  const caseId = '10000000-0000-4000-8000-000000000088';
  vi.mocked(sdk.accessProfileReview).mockResolvedValue({
    ...detail,
    review: { ...review, id: caseId },
  });
  vi.mocked(sdk.decideProfileReview).mockRejectedValueOnce(
    new sdk.ClientFailure('NETWORK_UNAVAILABLE'),
  );
  show(<ProfileReviewCase actorId={actor} kind="identity" id={caseId} close={vi.fn()} />);
  await access();
  fireEvent.change(screen.getByLabelText('Profile review decision reason'), {
    target: { value: 'Evidence confirms the requested legal correction' },
  });
  fireEvent.click(screen.getByText('approve profile review'));
  fireEvent.click(screen.getByText('Confirm profile review decision'));
  await screen.findByText('Retry previous request');
  const original = vi.mocked(sdk.decideProfileReview).mock.calls[0];
  fireEvent(window, new Event('blur'));
  fireEvent.click(await screen.findByText('Retry previous request'));
  await waitFor(() => expect(sdk.decideProfileReview).toHaveBeenCalledTimes(2));
  expect(vi.mocked(sdk.decideProfileReview).mock.calls[1]).toEqual(original);
});
it('HMA-015: self correction uses real upload references and sends only after confirmation', async () => {
  show(<OwnProfileReviews actorId={actor} />);
  fireEvent.click(screen.getByText('Profile correction and photo reviews'));
  fireEvent.change(screen.getByLabelText('Requested legal name'), {
    target: { value: 'Corrected legal identity' },
  });
  fireEvent.change(screen.getByLabelText('Profile request reason'), {
    target: { value: 'Correct the documented legal name' },
  });
  fireEvent.click(screen.getByText('Identity proof / CNIC front'));
  fireEvent.click(screen.getByText('Review profile request'));
  expect(sdk.submitProfileReview).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Confirm profile request'));
  await waitFor(() =>
    expect(sdk.submitProfileReview).toHaveBeenCalledWith(
      expect.anything(),
      'identity',
      {
        fullName: 'Corrected legal identity',
        reason: 'Correct the documented legal name',
        evidenceFileIds: [fileId],
      },
      expect.any(String),
    ),
  );
});
