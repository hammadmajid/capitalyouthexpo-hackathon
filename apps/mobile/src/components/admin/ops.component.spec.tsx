import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { SelfProfile, VerificationDossier } from '@hsm/contracts';
import * as sdk from '@hsm/api-client';
import { VerificationQueue } from './verification-queue';
import { VerificationDetail } from './verification-detail';
import { SupportQueue } from './support-queue';
import { SupportDetail } from './support-detail';
import { ModerationQueue } from './moderation-queue';
import { ModerationDetail } from './moderation-detail';
import { OwnSupportThread } from '../services/support-thread';
import { AdminSafety } from './safety';
const actor = '10000000-0000-4000-8000-000000000001';
const target = '10000000-0000-4000-8000-000000000002';
const other = '10000000-0000-4000-8000-000000000003';
const at = '2026-10-30T10:00:00.000Z';
let mockParams: { branchId?: string; ticketId?: string; reviewId?: string; reportId?: string };
let mockProfile: SelfProfile;
const mockRefresh = jest.fn();
jest.mock('../providers', () => ({
  useSession: () => ({ profile: mockProfile, refetch: mockRefresh }),
}));
jest.mock('../../lib/runtime', () => ({
  actorClient: async () => ({}),
  sessions: { restore: jest.fn() },
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'ffffffff-ffff-4fff-8fff-ffffffffffff' }));
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
    useLocalSearchParams: () => mockParams,
    useFocusEffect: (callback: import('react').EffectCallback) =>
      React.useEffect(callback, [callback]),
  };
});
jest.mock('../frame', () => {
  const { Text, View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Page: ({ title, children }: { title: string; children: ReactNode }) => (
      <View>
        <Text>{title}</Text>
        {children}
      </View>
    ),
  };
});
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  readVerificationQueue: jest.fn(),
  readVerificationDossier: jest.fn(),
  readVerificationHistory: jest.fn(),
  readVerificationSnapshots: jest.fn(),
  readVerificationSnapshotItems: jest.fn(),
  readVerificationEvidence: jest.fn(),
  readVerificationPricing: jest.fn(),
  readVerificationPhotos: jest.fn(),
  submitVerificationDecision: jest.fn(),
  readAdminSupportQueue: jest.fn(),
  readSupportTicket: jest.fn(),
  readAdminSupportMessages: jest.fn(),
  readOwnSupportMessages: jest.fn(),
  actOnSupportTicket: jest.fn(),
  listModerationReports: jest.fn(),
  listModeratedReviews: jest.fn(),
  readModerationReview: jest.fn(),
  readModerationHistory: jest.fn(),
  moderateReview: jest.fn(),
  dismissReviewReport: jest.fn(),
  listChatReports: jest.fn(),
  readChatSafetyContext: jest.fn(),
}));
const dossier: VerificationDossier = {
  branchId: target,
  branchName: 'Fixture branch',
  organizationName: 'Fixture hostel',
  status: 'submitted',
  updatedAt: at,
  submittedAt: at,
  completenessScore: 90,
  category: null,
  addressLine: null,
  description: null,
  cityId: null,
  areaId: null,
  location: null,
  publicPhone: null,
  publicEmail: null,
  showPublicContact: false,
  propertyTier: null,
  establishmentYear: null,
  owner: { fullName: 'Owner fixture', cnicLast4: '1234', profileCompletedAt: at },
  evidence: [
    { fileId: other, side: 'front', mimeType: 'image/jpeg', sizeBytes: '100', available: true },
  ],
  source: 'current_record',
};
const ticket = {
  id: target,
  subject: 'Fixture ticket',
  category: 'account' as const,
  status: 'open' as const,
  priority: 'normal' as const,
  openedByName: 'Participant',
  assignedToName: null,
  version: 3,
  createdAt: at,
  updatedAt: at,
  messages: [],
};
const review = {
  reviewId: target,
  branchId: other,
  body: 'Review fixture',
  status: 'hidden' as const,
  moderationReason: 'Prior policy reason',
  version: 4,
  createdAt: at,
  editedAt: null,
};
const safetyCase = {
  id: target,
  reporterUserId: actor,
  targetType: 'chat_message' as const,
  targetId: other,
  reason: 'harassment' as const,
  details: null,
  status: 'open' as const,
  createdAt: at,
};
const context = {
  reportId: target,
  reportedMessageId: other,
  messages: [
    {
      id: other,
      senderSide: 'branch' as const,
      body: 'Restricted case evidence',
      attachmentCount: 1,
      createdAt: at,
      removed: false,
    },
  ],
};
beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { branchId: target, ticketId: target, reviewId: target, reportId: other };
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
  };
  mockRefresh.mockImplementation(async () => mockProfile);
  jest.mocked(sdk.readVerificationQueue).mockResolvedValue({
    data: [
      {
        branchId: target,
        branchName: dossier.branchName,
        organizationName: dossier.organizationName,
        status: 'submitted',
        updatedAt: at,
      },
    ],
    nextCursor: null,
  });
  jest.mocked(sdk.readVerificationDossier).mockResolvedValue(dossier);
  jest.mocked(sdk.readVerificationHistory).mockResolvedValue({ data: [], nextCursor: null });
  jest.mocked(sdk.readVerificationSnapshots).mockResolvedValue({
    current: null,
    lastApproved: null,
    changedFields: [],
    historicalSnapshotUnavailable: true,
  });
  jest.mocked(sdk.readVerificationSnapshotItems).mockResolvedValue({ data: [], nextCursor: null });
  jest.mocked(sdk.readVerificationPricing).mockResolvedValue({ data: [], nextCursor: null });
  jest.mocked(sdk.readVerificationPhotos).mockResolvedValue({ data: [], nextCursor: null });
  jest.mocked(sdk.submitVerificationDecision).mockResolvedValue({
    branchId: target,
    branchName: dossier.branchName,
    organizationName: dossier.organizationName,
    status: 'approved',
    updatedAt: at,
  });
  jest
    .mocked(sdk.readVerificationEvidence)
    .mockResolvedValue({ url: 'https://private.example.test/evidence', expiresAt: at });
  jest.mocked(sdk.readAdminSupportQueue).mockResolvedValue({ data: [ticket], nextCursor: null });
  jest.mocked(sdk.readSupportTicket).mockResolvedValue(ticket);
  jest
    .mocked(sdk.readAdminSupportMessages)
    .mockResolvedValue({ ticketId: target, data: [], nextCursor: null });
  jest.mocked(sdk.actOnSupportTicket).mockResolvedValue(ticket);
  jest.mocked(sdk.listModerationReports).mockResolvedValue({ data: [], nextCursor: null });
  jest.mocked(sdk.listModeratedReviews).mockResolvedValue({ data: [review], nextCursor: null });
  jest.mocked(sdk.readModerationReview).mockResolvedValue(review);
  jest.mocked(sdk.readModerationHistory).mockResolvedValue({ data: [], nextCursor: null });
  jest
    .mocked(sdk.moderateReview)
    .mockResolvedValue({ reviewId: target, status: 'published', version: 5 });
  jest.mocked(sdk.dismissReviewReport).mockResolvedValue({ reportId: other, status: 'dismissed' });
  jest.mocked(sdk.listChatReports).mockResolvedValue({ data: [safetyCase], nextCursor: null });
  jest.mocked(sdk.readChatSafetyContext).mockResolvedValue(context);
});
async function show(node: ReactNode) {
  const cache = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  const ui = await render(<QueryClientProvider client={cache}>{node}</QueryClientProvider>);
  return { cache, ...ui };
}
it('TRUST-001: Pending merges submitted and in-review, follows continuation and opens the dossier', async () => {
  const row = (branchId: string, branchName: string, status: 'submitted' | 'under_review') => ({
    branchId,
    branchName,
    organizationName: dossier.organizationName,
    status,
    updatedAt: at,
  });
  jest.mocked(sdk.readVerificationQueue).mockImplementation(async (_client, input) => {
    const query = input as { status?: string; cursor?: string };
    if (query.status === 'under_review')
      return { data: [row(other, 'Reviewing branch', 'under_review')], nextCursor: null };
    if (query.status === 'submitted' && !query.cursor)
      return { data: [row(target, dossier.branchName, 'submitted')], nextCursor: target };
    return { data: [], nextCursor: null };
  });
  await show(<VerificationQueue />);
  expect(await screen.findByRole('button', { name: 'Review Reviewing branch' })).toBeTruthy();
  await fireEvent.press(await screen.findByRole('button', { name: 'Load more' }));
  await waitFor(() =>
    expect(sdk.readVerificationQueue).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ cursor: target, status: 'submitted' }),
    ),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Review Fixture branch' }));
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/admin/verifications/[branchId]',
    params: { branchId: target },
  });
  await fireEvent.press(screen.getByRole('tab', { name: 'Approved' }));
  await waitFor(() =>
    expect(sdk.readVerificationQueue).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'approved' }),
    ),
  );
});
it('TRUST-001 ADM-007: reject needs a reason; approve confirms with a fresh server version', async () => {
  await show(<VerificationDetail />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Reject' }));
  expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Approve' }));
  expect(sdk.submitVerificationDecision).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('Note (optional)'), 'Evidence reviewed');
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() =>
    expect(sdk.submitVerificationDecision).toHaveBeenCalledWith(
      expect.anything(),
      target,
      {
        action: 'approve',
        reason: 'Evidence reviewed',
        expectedStatus: 'submitted',
        expectedUpdatedAt: at,
      },
      expect.any(String),
    ),
  );
});
it('TRUST-002 SEC-003: private evidence is explicit, purpose-bound and never auto-fetched', async () => {
  await show(<VerificationDetail />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Evidence tab' }));
  const button = await screen.findByRole('button', { name: 'CNIC front' });
  expect(button).toBeDisabled();
  expect(sdk.readVerificationEvidence).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('Access purpose'), 'Review listing identity');
  await fireEvent.press(button);
  expect(await screen.findByRole('button', { name: 'Open' })).toBeTruthy();
  expect(sdk.readVerificationEvidence).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Open' })).toBeNull());
  expect(screen.getByLabelText('Access purpose').props.value).toBe('');
});
it('ADM-009: internal note and participant reply are distinct confirmed staff commands', async () => {
  await show(<SupportDetail />);
  await screen.findByText('Fixture ticket');
  await fireEvent.press(screen.getByRole('button', { name: 'internal note' }));
  await fireEvent.changeText(screen.getByLabelText('Internal note'), 'Staff-only investigation');
  await fireEvent.press(screen.getByRole('button', { name: 'Review support action' }));
  expect(sdk.actOnSupportTicket).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm support action' }));
  await waitFor(() =>
    expect(sdk.actOnSupportTicket).toHaveBeenCalledWith(
      expect.anything(),
      target,
      expect.objectContaining({
        expectedVersion: 3,
        internal: true,
        body: 'Staff-only investigation',
      }),
      expect.any(String),
    ),
  );
});
it('ADM-009: support search applies literal subject text and priority to the server reader', async () => {
  await show(<SupportQueue />);
  await fireEvent.press(screen.getByRole('button', { name: 'Filters and sorting' }));
  await screen.findByText('Fixture ticket');
  await fireEvent.press(screen.getByRole('button', { name: 'Search Support' }));
  await fireEvent.changeText(screen.getByLabelText('Search ticket subject'), 'Access %_');
  expect(sdk.readAdminSupportQueue).not.toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ q: 'Access %_' }),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Apply ticket search' }));
  await fireEvent.press(screen.getByRole('button', { name: 'critical' }));
  await waitFor(() =>
    expect(sdk.readAdminSupportQueue).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ q: 'Access %_', priority: 'critical' }),
    ),
  );
});
it('REV-006: restoration discovery finds hidden reviews without requiring an open report', async () => {
  await show(<ModerationQueue />);
  await fireEvent.press(screen.getByRole('button', { name: 'restoration' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Review moderation history' }));
  expect(sdk.listModeratedReviews).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ status: 'hidden' }),
  );
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/admin/moderation/[reviewId]',
    params: { reviewId: target },
  });
});
it('REV-006: restore requires a policy reason and exact reviewed version, while dismiss keeps report scope', async () => {
  await show(<ModerationDetail />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Restore review' }));
  expect(screen.getByRole('button', { name: 'Confirm moderation decision' })).toBeDisabled();
  await fireEvent.changeText(
    screen.getByLabelText('Moderation policy reason'),
    'Policy violation cleared',
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm moderation decision' }));
  await waitFor(() =>
    expect(sdk.moderateReview).toHaveBeenCalledWith(
      expect.anything(),
      target,
      {
        action: 'restore',
        reason: 'Policy violation cleared',
        expectedVersion: 4,
        reportId: other,
      },
      expect.any(String),
    ),
  );
});
it('COMM-002 AUD-002: case context requires explicit purpose and clears when closed', async () => {
  await show(<AdminSafety />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Review reported message' }));
  expect(sdk.readChatSafetyContext).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Authorize audited context access' })).toBeDisabled();
  await fireEvent.changeText(
    screen.getByLabelText('Investigation purpose'),
    'Investigate reported harassment',
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Authorize audited context access' }));
  expect(await screen.findByText('Restricted case evidence')).toBeTruthy();
  expect(sdk.readChatSafetyContext).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: 'Close sensitive context' }));
  expect(screen.queryByText('Restricted case evidence')).toBeNull();
});
it('COMM-002 SEC-003: denied sensitive read has no automatic retry and late authority loss cannot disclose context', async () => {
  jest.mocked(sdk.readChatSafetyContext).mockRejectedValueOnce(new Error('Fixture denied'));
  await show(<AdminSafety />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Review reported message' }));
  await fireEvent.changeText(
    screen.getByLabelText('Investigation purpose'),
    'Investigate harassment',
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Authorize audited context access' }));
  expect(
    await screen.findByText('Context unavailable. Recheck your purpose and current access.'),
  ).toBeTruthy();
  expect(sdk.readChatSafetyContext).toHaveBeenCalledTimes(1);
  let resolve: ((value: typeof context) => void) | undefined;
  jest.mocked(sdk.readChatSafetyContext).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await fireEvent.changeText(
    screen.getByLabelText('Investigation purpose'),
    'Reviewed with authority',
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Authorize audited context access' }));
  await waitFor(() => expect(sdk.readChatSafetyContext).toHaveBeenCalledTimes(2));
  mockProfile.capabilities.admin = null;
  await act(async () => {
    resolve?.(context);
  });
  expect(screen.queryByText('Restricted case evidence')).toBeNull();
});
it('ADM-009 SEC-003: participant thread follows server continuation rather than a capped preview', async () => {
  jest
    .mocked(sdk.readOwnSupportMessages)
    .mockResolvedValueOnce({
      ticketId: target,
      data: [
        {
          id: target,
          authorName: 'Participant',
          fromSupport: false,
          internal: false,
          body: 'First participant message',
          createdAt: at,
        },
      ],
      nextCursor: target,
    })
    .mockResolvedValue({
      ticketId: target,
      data: [
        {
          id: other,
          authorName: 'Support',
          fromSupport: true,
          internal: false,
          body: 'Later participant message',
          createdAt: at,
        },
      ],
      nextCursor: null,
    });
  await show(<OwnSupportThread actorId={actor} ticketId={target} />);
  expect(await screen.findByText('You: First participant message')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Load more ticket messages' }));
  expect(await screen.findByText('HSM support: Later participant message')).toBeTruthy();
  expect(sdk.readOwnSupportMessages).toHaveBeenLastCalledWith(expect.anything(), target, {
    limit: 50,
    cursor: target,
  });
});
