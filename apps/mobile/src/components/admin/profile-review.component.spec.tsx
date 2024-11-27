import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SelfProfile } from '@hsm/contracts';
import * as sdk from '@hsm/api-client';
import { NativeProfileReviewCase } from './profile-review-case';
import { NativeOwnProfileReviews } from '../own-profile-reviews';
const actor = '10000000-0000-4000-8000-000000000001',
  target = '10000000-0000-4000-8000-000000000002',
  file = '10000000-0000-4000-8000-000000000003',
  at = '2026-10-30T16:00:00.000Z';
let mockProfile: SelfProfile;
const mockFocusCleanup: (() => void)[] = [];
jest.mock('../providers', () => ({
  useSession: () => ({ profile: mockProfile, refetch: async () => mockProfile }),
}));
jest.mock('../../lib/runtime', () => ({
  actorClient: async () => ({}),
  sessions: { restore: jest.fn() },
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'ffffffff-ffff-4fff-8fff-ffffffffffff' }));
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    router: { back: jest.fn(), push: jest.fn() },
    useFocusEffect: (callback: import('react').EffectCallback) =>
      React.useEffect(() => {
        const cleanup = callback();
        if (cleanup) mockFocusCleanup.push(cleanup);
        return cleanup;
      }, [callback]),
  };
});
jest.mock('../private-file-picker', () => ({
  PrivateFilePicker: ({ label, onReady }: { label: string; onReady: (id: string) => void }) => {
    const { Button } = jest.requireActual<typeof import('../ui')>('../ui');
    return <Button label={label} onPress={() => onReady('10000000-0000-4000-8000-000000000003')} />;
  },
}));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  accessProfileReview: jest.fn(),
  accessProfileReviewEvidence: jest.fn(),
  decideProfileReview: jest.fn(),
  readProfileReviewHistory: jest.fn(),
  listProfileReviews: jest.fn(),
  listProfilePhotoSubjects: jest.fn(),
  submitProfileReview: jest.fn(),
}));
const review = {
  id: target,
  userId: target,
  kind: 'identity' as const,
  status: 'pending' as const,
  version: 1,
  submittedAt: at,
  updatedAt: at,
};
const detail = {
  review,
  reason: 'Documented legal correction',
  previousFullName: 'Previous private name',
  proposedFullName: 'Corrected private name',
  previousCnicLast4: '1234',
  proposedCnic: '1234512345671',
  previousPhotoFileId: null,
  proposedPhotoFileId: null,
  currentPhoto: false,
  evidenceFileIds: [file],
};
beforeEach(() => {
  jest.clearAllMocks();
  mockFocusCleanup.splice(0);
  mockProfile = {
    user: {
      id: actor,
      fullName: 'Root fixture',
      email: null,
      emailVerified: true,
      cnicLast4: null,
    },
    capabilities: {
      customer: false,
      owner: false,
      managerOf: [],
      admin: { isRoot: true, roles: [] },
    },
    features: { profileReviews: true },
  };
  jest.mocked(sdk.accessProfileReview).mockResolvedValue(detail);
  jest
    .mocked(sdk.decideProfileReview)
    .mockResolvedValue({ ...review, status: 'approved', version: 2 });
  jest.mocked(sdk.readProfileReviewHistory).mockResolvedValue({ data: [], nextCursor: null });
  jest.mocked(sdk.listProfileReviews).mockResolvedValue({ data: [], nextCursor: null });
  jest.mocked(sdk.listProfilePhotoSubjects).mockResolvedValue({ data: [], nextCursor: null });
  jest.mocked(sdk.submitProfileReview).mockResolvedValue(review);
});
function show(node: ReactNode) {
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
it('HMA-015: Native private review and approval require purpose, reason and current-version confirmation', async () => {
  await show(<NativeProfileReviewCase id={target} kind="identity" close={jest.fn()} />);
  expect(sdk.accessProfileReview).not.toHaveBeenCalled();
  await fireEvent.changeText(
    screen.getByLabelText('Profile review access purpose'),
    'Verify submitted identity documents',
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Access private review details' }));
  await screen.findByText('Requested name: Corrected private name');
  await fireEvent.changeText(
    screen.getByLabelText('Profile review decision reason'),
    'Documents confirm requested legal correction',
  );
  await fireEvent.press(screen.getByRole('button', { name: 'approve profile review' }));
  expect(sdk.decideProfileReview).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm profile review decision' }));
  await waitFor(() =>
    expect(sdk.decideProfileReview).toHaveBeenCalledWith(
      expect.anything(),
      'identity',
      target,
      {
        action: 'approve',
        expectedVersion: 1,
        reason: 'Documents confirm requested legal correction',
      },
      expect.any(String),
      false,
    ),
  );
});
it('HMA-015 SEC-003: Native focus loss discards late private detail responses', async () => {
  let resolve: ((value: typeof detail) => void) | undefined;
  jest.mocked(sdk.accessProfileReview).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await show(<NativeProfileReviewCase id={target} kind="identity" close={jest.fn()} />);
  await fireEvent.changeText(
    screen.getByLabelText('Profile review access purpose'),
    'Verify submitted identity documents',
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Access private review details' }));
  await waitFor(() => expect(resolve).toBeDefined());
  await act(async () => {
    for (const clear of mockFocusCleanup) clear();
    resolve?.(detail);
  });
  expect(screen.queryByText('Requested name: Corrected private name')).toBeNull();
});
it('HMA-015 SEC-003: verification-only Native staff never request private identity details', async () => {
  mockProfile = {
    ...mockProfile,
    capabilities: {
      ...mockProfile.capabilities,
      admin: { isRoot: false, roles: ['verification'] },
    },
  };
  await show(<NativeProfileReviewCase id={target} kind="identity" close={jest.fn()} />);
  await fireEvent.changeText(
    screen.getByLabelText('Profile review access purpose'),
    'Verify submitted identity documents',
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Access private review details' }));
  await screen.findByText(
    /Request could not be completed|Unable|unavailable|unexpected|try again/i,
  );
  expect(sdk.accessProfileReview).not.toHaveBeenCalled();
});
it('HMA-015: Native self correction submits selected private proof only after confirmation', async () => {
  mockProfile = {
    ...mockProfile,
    capabilities: { ...mockProfile.capabilities, customer: true, admin: null },
  };
  await show(<NativeOwnProfileReviews />);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Profile correction and photo reviews' }),
  );
  await fireEvent.changeText(screen.getByLabelText('Requested legal name'), 'Corrected legal name');
  await fireEvent.changeText(
    screen.getByLabelText('Profile request reason'),
    'Correct the documented legal name',
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Identity proof / CNIC front' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Review profile request' }));
  expect(sdk.submitProfileReview).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm profile request' }));
  await waitFor(() =>
    expect(sdk.submitProfileReview).toHaveBeenCalledWith(
      expect.anything(),
      'identity',
      {
        fullName: 'Corrected legal name',
        reason: 'Correct the documented legal name',
        evidenceFileIds: [file],
      },
      expect.any(String),
    ),
  );
});

it.each(['approve', 'withdraw'] as const)(
  'HMA-015: Native photo %s requires current-version confirmation for a moderator',
  async (action) => {
    mockProfile = {
      ...mockProfile,
      capabilities: {
        ...mockProfile.capabilities,
        admin: { isRoot: false, roles: ['content_moderator'] },
      },
    };
    const current = action === 'withdraw';
    const photo = {
      ...review,
      kind: 'profile_photo' as const,
      status: current ? ('approved' as const) : ('pending' as const),
      version: current ? 2 : 1,
    };
    jest.mocked(sdk.accessProfileReview).mockResolvedValue({
      ...detail,
      review: photo,
      previousFullName: null,
      proposedFullName: null,
      previousCnicLast4: null,
      proposedCnic: null,
      proposedPhotoFileId: file,
      currentPhoto: current,
    });
    jest.mocked(sdk.decideProfileReview).mockResolvedValue({
      ...photo,
      status: current ? 'withdrawn' : 'approved',
      version: photo.version + 1,
    });
    await show(<NativeProfileReviewCase id={target} kind="profile_photo" close={jest.fn()} />);
    await fireEvent.changeText(
      screen.getByLabelText('Profile review access purpose'),
      'Verify the private profile photo',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Access private review details' }));
    await screen.findByText(current ? 'Current profile photo' : 'Photo is not currently displayed');
    expect(screen.queryByText('Requested name: Corrected private name')).toBeNull();
    await fireEvent.changeText(
      screen.getByLabelText('Profile review decision reason'),
      'Confirmed photo policy review decision',
    );
    await fireEvent.press(screen.getByRole('button', { name: action + ' profile review' }));
    expect(sdk.decideProfileReview).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Confirm profile review decision' }));
    await waitFor(() =>
      expect(sdk.decideProfileReview).toHaveBeenCalledWith(
        expect.anything(),
        'profile_photo',
        target,
        {
          action,
          expectedVersion: photo.version,
          reason: 'Confirmed photo policy review decision',
        },
        expect.any(String),
        false,
      ),
    );
  },
);

it('HMA-015: Native photo submission sends selected proof only after confirmation', async () => {
  mockProfile = {
    ...mockProfile,
    capabilities: { ...mockProfile.capabilities, customer: true, admin: null },
  };
  jest.mocked(sdk.submitProfileReview).mockResolvedValue({ ...review, kind: 'profile_photo' });
  await show(<NativeOwnProfileReviews />);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Profile correction and photo reviews' }),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'profile photo' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Profile photo for review' }));
  await fireEvent.changeText(
    screen.getByLabelText('Profile request reason'),
    'Review the selected private profile photo',
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Review profile request' }));
  expect(sdk.submitProfileReview).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm profile request' }));
  await waitFor(() =>
    expect(sdk.submitProfileReview).toHaveBeenCalledWith(
      expect.anything(),
      'profile_photo',
      { fileId: file, reason: 'Review the selected private profile photo' },
      expect.any(String),
    ),
  );
});
