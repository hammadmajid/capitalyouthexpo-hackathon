import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import * as sdk from '@hsm/api-client';
import { VerificationOperations } from './admin-operations-verification';
import { ModerationOperations } from './admin-operations-moderation';
import { SupportOperations } from './admin-operations-support';
import { InstitutionAdministration } from './admin-settings-institutions';
import { CustomerGovernance } from './customer-governance';
import { OwnSupportThread } from './own-support-thread';
const names = vi.hoisted(() => [
  'listAdminInstitutions',
  'readAdminInstitution',
  'readAdminInstitutionHistory',
  'saveAdminInstitution',
  'listGovernedCustomers',
  'decideCustomer',
  'readOwnSupportMessages',
  'readVerificationQueue',
  'readVerificationDossier',
  'readVerificationHistory',
  'readVerificationSnapshots',
  'readVerificationSnapshotItems',
  'readVerificationEvidence',
  'readVerificationPricing',
  'readVerificationPhotos',
  'submitVerificationDecision',
  'listModerationReports',
  'listModeratedReviews',
  'readModerationReview',
  'readModerationHistory',
  'moderateReview',
  'dismissReviewReport',
  'readAdminSupportQueue',
  'readSupportTicket',
  'readAdminSupportMessages',
  'actOnSupportTicket',
]);
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  ...Object.fromEntries(names.map((name) => [name, vi.fn()])),
}));
vi.mock('./admin-operations', async (original) => ({
  ...(await original<typeof import('./admin-operations')>()),
  useOperationScope: (actorId: string, module: string) => ({
    key: ['platform-admin-web', actorId, module],
    read: async (work: (client: object) => Promise<unknown>) => work({}),
  }),
}));
const id = '10000000-0000-4000-8000-000000000001',
  next = '10000000-0000-4000-8000-000000000002';
const now = '2026-10-30T04:00:00.000Z';
const dossier = {
  branchId: id,
  branchName: 'Hostel fixture',
  organizationName: 'Owner organization',
  status: 'submitted',
  updatedAt: now,
  submittedAt: now,
  completenessScore: 100,
  category: 'boys',
  addressLine: 'Fixture address',
  description: null,
  cityId: null,
  areaId: null,
  location: null,
  publicPhone: null,
  publicEmail: null,
  showPublicContact: false,
  propertyTier: null,
  establishmentYear: null,
  owner: { fullName: 'Owner fixture', cnicLast4: '1234', profileCompletedAt: now },
  evidence: [
    { fileId: next, side: 'front', mimeType: 'image/png', sizeBytes: '128', available: true },
  ],
  source: 'current_record',
};
const review = {
  reviewId: id,
  branchId: id,
  body: 'Reported content fixture',
  status: 'hidden',
  moderationReason: 'Policy fixture',
  version: 2,
  createdAt: now,
  editedAt: null,
};
const ticket = {
  id,
  subject: 'Access help fixture',
  category: 'account',
  priority: 'normal',
  status: 'open',
  openedByName: 'User fixture',
  assignedToName: null,
  version: 3,
  createdAt: now,
  updatedAt: now,
  messages: [],
};
const message = {
  id,
  authorName: 'Staff fixture',
  internal: true,
  fromSupport: true,
  body: 'Private staff note fixture',
  createdAt: now,
};
function mock(name: string, value: unknown) {
  vi.mocked(sdk[name as keyof typeof sdk] as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    value,
  );
}
function show(node: ReactNode) {
  const cache = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  render(<QueryClientProvider client={cache}>{node}</QueryClientProvider>);
  return cache;
}
beforeEach(() => {
  vi.clearAllMocks();
  mock('readVerificationQueue', {
    data: [
      {
        branchId: id,
        branchName: 'Hostel fixture',
        organizationName: 'Owner fixture',
        status: 'submitted',
        updatedAt: now,
      },
    ],
    nextCursor: null,
  });
  mock('readVerificationDossier', dossier);
  mock('readVerificationHistory', { data: [], nextCursor: null });
  mock('readVerificationSnapshots', {
    current: null,
    lastApproved: null,
    changedFields: [],
    historicalSnapshotUnavailable: true,
  });
  mock('readVerificationSnapshotItems', { data: [], nextCursor: null });
  mock('readVerificationPricing', { data: [], nextCursor: null });
  mock('readVerificationPhotos', { data: [], nextCursor: null });
  mock('submitVerificationDecision', { ...dossier, status: 'under_review' });
  mock('readVerificationEvidence', {
    url: 'https://files.example.test/controlled',
    expiresAt: now,
  });
  mock('listModerationReports', {
    data: [
      {
        reportId: next,
        reviewId: id,
        branchId: id,
        reason: 'spam',
        details: 'Report fixture',
        status: 'open',
        reviewStatus: 'hidden',
        reviewBody: review.body,
        reviewVersion: 2,
        createdAt: now,
      },
    ],
    nextCursor: null,
  });
  mock('listModeratedReviews', { data: [review], nextCursor: null });
  mock('readModerationReview', review);
  mock('readModerationHistory', { data: [], nextCursor: null });
  mock('moderateReview', { reviewId: id, status: 'published', version: 3 });
  mock('dismissReviewReport', { reportId: next, status: 'dismissed' });
  mock('readAdminSupportQueue', { data: [ticket], nextCursor: null });
  mock('readSupportTicket', ticket);
  mock('readAdminSupportMessages', { ticketId: id, data: [message], nextCursor: null });
  mock('actOnSupportTicket', ticket);
});
afterEach(cleanup);
it('ADM-007: Web verification requires reason and explicit confirmation, carries expected server state', async () => {
  show(<VerificationOperations actorId="root-fixture" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Review Hostel fixture · submitted' }));
  await screen.findByText('Hostel fixture dossier');
  fireEvent.change(screen.getByLabelText('Verification action'), {
    target: { value: 'start_review' },
  });
  expect(
    (screen.getByRole('button', { name: 'Review verification decision' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.change(screen.getByLabelText('Verification reason'), {
    target: { value: 'Start policy review' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Review verification decision' }));
  expect(sdk.submitVerificationDecision).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm verification decision' }));
  await waitFor(() =>
    expect(sdk.submitVerificationDecision).toHaveBeenCalledWith(
      expect.anything(),
      id,
      expect.objectContaining({
        action: 'start_review',
        reason: 'Start policy review',
        expectedStatus: 'submitted',
        expectedUpdatedAt: now,
      }),
      expect.any(String),
    ),
  );
});
it('TRUST-002 SEC-003: evidence never opens automatically and requires explicit justified access', async () => {
  show(<VerificationOperations actorId="root-fixture" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Review Hostel fixture · submitted' }));
  const button = await screen.findByRole('button', { name: 'Access front evidence' });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  expect(sdk.readVerificationEvidence).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Document access purpose'), {
    target: { value: 'Review submitted identity proof' },
  });
  fireEvent.click(button);
  await waitFor(() =>
    expect(sdk.readVerificationEvidence).toHaveBeenCalledWith(expect.anything(), id, next, {
      justification: 'Review submitted identity proof',
    }),
  );
  expect(await screen.findByRole('link', { name: /Open authorized document/ })).toBeDefined();
});
it('REV-006: hidden/removed restoration discovery and current-version action require policy confirmation', async () => {
  show(<ModerationOperations actorId="root-fixture" />);
  fireEvent.change(screen.getByLabelText('Moderation queue'), { target: { value: 'hidden' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Review moderated content' }));
  await screen.findByText('Current review · hidden');
  fireEvent.change(screen.getByLabelText('Review moderation action'), {
    target: { value: 'restore' },
  });
  fireEvent.change(screen.getByLabelText('Policy reason'), {
    target: { value: 'Policy re-review permits restoration' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Review moderation decision' }));
  expect(sdk.moderateReview).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm moderation decision' }));
  await waitFor(() =>
    expect(sdk.moderateReview).toHaveBeenCalledWith(
      expect.anything(),
      id,
      { action: 'restore', reason: 'Policy re-review permits restoration', expectedVersion: 2 },
      expect.any(String),
    ),
  );
});
it('REV-006: report dismissal uses actual report and explicit reason without changing review visibility', async () => {
  show(<ModerationOperations actorId="root-fixture" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Review reported content' }));
  await screen.findByText('Current review · hidden');
  fireEvent.change(screen.getByLabelText('Review moderation action'), {
    target: { value: 'dismiss' },
  });
  fireEvent.change(screen.getByLabelText('Policy reason'), {
    target: { value: 'No policy violation found' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Review moderation decision' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm moderation decision' }));
  await waitFor(() =>
    expect(sdk.dismissReviewReport).toHaveBeenCalledWith(
      expect.anything(),
      next,
      { reason: 'No policy violation found' },
      expect.any(String),
    ),
  );
  expect(sdk.moderateReview).not.toHaveBeenCalled();
});
it('ADM-009: staff support filters, paged messages and internal-note/status/priority update use version and confirmation', async () => {
  vi.mocked(sdk.readAdminSupportMessages)
    .mockResolvedValueOnce({ ticketId: id, data: [message], nextCursor: id })
    .mockResolvedValue({
      ticketId: id,
      data: [{ ...message, id: next, body: 'Later thread message' }],
      nextCursor: null,
    });
  show(<SupportOperations actorId="support-fixture" />);
  fireEvent.change(screen.getByLabelText('Search staff tickets'), { target: { value: 'Access' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search tickets' }));
  await waitFor(() =>
    expect(sdk.readAdminSupportQueue).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ q: 'Access', limit: 20 }),
    ),
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Access help fixture · normal · open' }),
  );
  await screen.findByText('Private staff note fixture');
  fireEvent.click(screen.getByRole('button', { name: 'Load more ticket messages' }));
  await screen.findByText('Later thread message');
  fireEvent.change(screen.getByLabelText('Support reply'), {
    target: { value: 'Internal investigation note' },
  });
  fireEvent.click(screen.getByLabelText('Internal staff note'));
  fireEvent.click(screen.getByLabelText('Assign ticket to me'));
  fireEvent.change(screen.getByLabelText('Support ticket status'), {
    target: { value: 'resolved' },
  });
  fireEvent.change(screen.getByLabelText('Support ticket priority'), {
    target: { value: 'critical' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Review support update' }));
  expect(sdk.actOnSupportTicket).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm support update' }));
  await waitFor(() =>
    expect(sdk.actOnSupportTicket).toHaveBeenCalledWith(
      expect.anything(),
      id,
      {
        expectedVersion: 3,
        body: 'Internal investigation note',
        internal: true,
        assignToMe: true,
        status: 'resolved',
        priority: 'critical',
      },
      expect.any(String),
    ),
  );
});
it('ADM-009: closed staff ticket cannot present a status-change control as editable', async () => {
  mock('readSupportTicket', { ...ticket, status: 'closed' });
  show(<SupportOperations actorId="support-fixture" />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Access help fixture · normal · open' }),
  );
  expect(
    ((await screen.findByLabelText('Support ticket status')) as HTMLSelectElement).disabled,
  ).toBe(true);
});
it('REV-006: failed refreshed moderation results hide cached content and provide retry', async () => {
  vi.mocked(sdk.listModerationReports).mockRejectedValue(new Error('Offline'));
  show(<ModerationOperations actorId="root-fixture" />);
  expect(await screen.findByRole('button', { name: 'Retry records' })).toBeDefined();
  expect(screen.queryByRole('button', { name: 'Review reported content' })).toBeNull();
});
it('ADM-009 SEC-003: participant thread pages beyond preview without staff notes', async () => {
  vi.mocked(sdk.readOwnSupportMessages)
    .mockResolvedValueOnce({
      ticketId: id,
      data: [{ ...message, internal: false, body: 'First public reply' }],
      nextCursor: id,
    })
    .mockResolvedValue({
      ticketId: id,
      data: [{ ...message, id: next, internal: false, body: 'Later public reply' }],
      nextCursor: null,
    });
  show(<OwnSupportThread actorId={id} ticketId={id} />);
  expect(await screen.findByText('HSM support: First public reply')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Load more ticket messages' }));
  expect(await screen.findByText('HSM support: Later public reply')).toBeTruthy();
  expect(sdk.readOwnSupportMessages).toHaveBeenLastCalledWith(expect.anything(), id, {
    limit: 50,
    cursor: id,
  });
});

it('HMA-015: Web customer decision requires a reason, review and exact current status', async () => {
  mock('listGovernedCustomers', {
    data: [{ userId: id, fullName: 'Customer fixture', status: 'active', updatedAt: now }],
    nextCursor: null,
  });
  show(<CustomerGovernance actorId={next} />);
  await screen.findByText('Customer fixture');
  fireEvent.change(screen.getByLabelText('Decision reason for Customer fixture'), {
    target: { value: 'Confirmed repeated harassment' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'warn customer' }));
  expect(sdk.decideCustomer).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm customer decision' }));
  await waitFor(() =>
    expect(sdk.decideCustomer).toHaveBeenCalledWith(
      expect.anything(),
      id,
      {
        action: 'warn',
        reason: 'Confirmed repeated harassment',
        expectedStatus: 'active',
        expectedUpdatedAt: now,
      },
      expect.any(String),
    ),
  );
});

it('HMA-015: Web institution edits preserve revision, require reason and carry explicit reapproval', async () => {
  const record = {
    id,
    revision: '17',
    name: 'University fixture',
    shortName: null,
    cityId: next,
    areaId: null,
    address: null,
    latitude: 33,
    longitude: 73,
    aliases: [],
    isActive: true,
    publicApproved: true,
  };
  mock('listAdminInstitutions', { data: [record], nextCursor: null });
  mock('readAdminInstitution', record);
  mock('readAdminInstitutionHistory', { data: [], nextCursor: null });
  show(<InstitutionAdministration actorId={next} />);
  fireEvent.click(await screen.findByText('Edit University fixture'));
  fireEvent.change(await screen.findByLabelText('Institution change reason'), {
    target: { value: 'Reviewed and confirmed campus relocation' },
  });
  fireEvent.change(screen.getByLabelText('Institution latitude'), { target: { value: '34' } });
  fireEvent.click(screen.getByLabelText('Explicitly reapprove identity, aliases and location'));
  fireEvent.click(screen.getByText('Review institution changes'));
  expect(sdk.saveAdminInstitution).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Confirm institution changes'));
  await waitFor(() =>
    expect(sdk.saveAdminInstitution).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        expectedRevision: '17',
        latitude: 34,
        reapprove: true,
        changeReason: 'Reviewed and confirmed campus relocation',
      }),
      expect.any(String),
      id,
    ),
  );
});

it('HMA-015 AUD-003: remount retries the complete original customer decision, including reason and preconditions', async () => {
  const target = '10000000-0000-4000-8000-000000000099';
  mock('listGovernedCustomers', {
    data: [{ userId: target, fullName: 'Recovery customer', status: 'active', updatedAt: now }],
    nextCursor: null,
  });
  vi.mocked(sdk.decideCustomer)
    .mockRejectedValueOnce(new sdk.ClientFailure('NETWORK_UNAVAILABLE'))
    .mockResolvedValue({
      userId: target,
      fullName: 'Recovery customer',
      status: 'active',
      updatedAt: now,
    });
  show(<CustomerGovernance actorId={next} />);
  await screen.findByText('Recovery customer');
  fireEvent.change(screen.getByLabelText('Decision reason for Recovery customer'), {
    target: { value: 'Confirmed harassment after review' },
  });
  fireEvent.click(screen.getByText('warn customer'));
  fireEvent.click(screen.getByText('Confirm customer decision'));
  await screen.findByText('Retry previous request');
  const original = vi.mocked(sdk.decideCustomer).mock.calls[0];
  cleanup();
  show(<CustomerGovernance actorId={next} />);
  fireEvent.click(await screen.findByText('Retry previous request'));
  await waitFor(() => expect(sdk.decideCustomer).toHaveBeenCalledTimes(2));
  expect(vi.mocked(sdk.decideCustomer).mock.calls[1]).toEqual(original);
});
