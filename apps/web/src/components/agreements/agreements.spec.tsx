import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  acknowledgeStayAgreement,
  readAgreementFiles,
  readAgreementFileUrl,
  readBillingSettings,
  readOwnStayRecord,
  readStaffStayRecord,
  saveAgreementTemplate,
} from '@hsm/api-client';
import { StayRecordPanel } from '../stay-record';
import { AgreementTemplate } from './agreement-template';
vi.mock('../../lib/client', () => ({ browserClient: () => ({}) }));
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  readBillingSettings: vi.fn(),
  saveAgreementTemplate: vi.fn(),
  readAgreementFiles: vi.fn(),
  readAgreementFileUrl: vi.fn(),
  acknowledgeStayAgreement: vi.fn(),
  readOwnStayRecord: vi.fn(),
  readStaffStayRecord: vi.fn(),
}));
const branchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  stayId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  versionId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  fileId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  digest = 'f'.repeat(64);
const policy = {
  cycle: { kind: 'calendar_month', dueDay: 5 },
  proration: { kind: 'full_period' },
  graceDays: 3,
  lateCharge: { kind: 'disabled' },
  noticeDays: 15,
  earlyCheckout: { kind: 'manual' },
  allowOpenEnded: true,
  customCharges: 'disabled',
};
function settings(canEdit: boolean, template?: object) {
  vi.mocked(readBillingSettings).mockResolvedValue({
    target: { branchId },
    canEdit,
    effectiveVersion: {
      id: versionId,
      level: 'branch',
      scopeId: branchId,
      policy: { ...policy, ...(template ? { agreementTemplate: template } : {}) },
      createdAt: '2026-10-19T10:00:00.000Z',
    },
  } as never);
}
function wrap(node: React.ReactNode) {
  render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);
}
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
it('STAY-002: an Owner saves a new agreement template version for future stays', async () => {
  settings(true);
  vi.mocked(saveAgreementTemplate).mockResolvedValue({} as never);
  const user = userEvent.setup();
  wrap(<AgreementTemplate actorId="owner" branchId={branchId} />);
  await user.click(await screen.findByRole('button', { name: 'Edit agreement template' }));
  await user.type(screen.getByLabelText('Agreement title'), 'House agreement');
  await user.click(screen.getByRole('button', { name: 'Save agreement' }));
  expect(screen.getByText('Add a title and agreement terms or document.')).toBeTruthy();
  expect(saveAgreementTemplate).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText('Agreement terms'), 'Quiet hours after 11 pm.');
  await user.click(screen.getByRole('button', { name: 'Save agreement' }));
  await waitFor(() => expect(saveAgreementTemplate).toHaveBeenCalledTimes(1));
  const [, sentBranch, body, key] = vi.mocked(saveAgreementTemplate).mock.calls[0] ?? [];
  expect(sentBranch).toBe(branchId);
  expect(body).toEqual({
    policyVersionId: versionId,
    template: { title: 'House agreement', text: 'Quiet hours after 11 pm.', fileId: null },
  });
  expect(typeof key).toBe('string');
  expect(await screen.findByText('Agreement version saved.')).toBeTruthy();
});
it('STAY-002: removing the template applies only to future stays', async () => {
  settings(true, { title: 'Old terms', text: 'Rules', fileId: null });
  vi.mocked(saveAgreementTemplate).mockResolvedValue({} as never);
  const user = userEvent.setup();
  wrap(<AgreementTemplate actorId="owner" branchId={branchId} />);
  expect(await screen.findByText('Old terms')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Edit agreement template' }));
  await user.click(screen.getByRole('button', { name: 'Remove future template' }));
  await waitFor(() =>
    expect(vi.mocked(saveAgreementTemplate).mock.calls[0]?.[2]).toEqual({
      policyVersionId: versionId,
      template: null,
    }),
  );
});
it('SEC-001: without billing edit access the template is view only', async () => {
  settings(false, { title: 'House rules', text: 'Rules', fileId: fileId });
  wrap(<AgreementTemplate actorId="manager" branchId={branchId} />);
  expect(await screen.findByText('House rules')).toBeTruthy();
  expect(screen.getByText('Document attached')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Edit agreement template' })).toBeNull();
});
function record() {
  return {
    stayId,
    branch: { id: branchId, name: 'Branch A' },
    agreements: [
      {
        id: versionId,
        version: 2,
        effectiveFrom: '2026-10-01',
        termsDigest: digest,
        acknowledgements: [],
        terms: {
          policyVersionId: versionId,
          currency: 'PKR',
          fees: [],
          catalog: [],
          rentAmountPaisa: 1800000,
          depositPaisa: 500000,
          policy: { ...policy, agreementTemplate: { title: 'Terms', text: 'Rules', fileId } },
        },
        fromBooking: false,
        createdAt: '2026-10-01T05:00:00.000Z',
      },
    ],
    assignments: [],
    history: [],
    truncated: false,
  } as never;
}
it('STAY-002: staff open agreement scans through signed URLs and cannot acknowledge', async () => {
  vi.mocked(readStaffStayRecord).mockResolvedValue(record());
  vi.mocked(readAgreementFiles).mockResolvedValue({
    data: [{ id: stayId, fileId: stayId, label: 'Signed agreement' }],
    nextCursor: null,
  } as never);
  vi.mocked(readAgreementFileUrl).mockResolvedValue({ url: 'https://files.test/signed' } as never);
  const opened = vi.spyOn(window, 'open').mockReturnValue(null);
  const user = userEvent.setup();
  wrap(<StayRecordPanel actorId="staff" branchId={branchId} stayId={stayId} />);
  await user.click(await screen.findByRole('button', { name: 'Agreement documents' }));
  await user.click(await screen.findByRole('button', { name: 'Signed agreement' }));
  await waitFor(() =>
    expect(opened).toHaveBeenCalledWith('https://files.test/signed', '_blank', 'noopener'),
  );
  expect(readAgreementFiles).toHaveBeenCalledWith(
    {},
    { stayId, agreementId: versionId, branchId },
    { limit: 20 },
  );
  expect(screen.getByRole('button', { name: 'Open original template document' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Review agreement policy' }));
  expect(screen.queryByRole('button', { name: 'Acknowledge this agreement' })).toBeNull();
  opened.mockRestore();
});
it('STAY-002: a resident acknowledges the exact agreement version and digest', async () => {
  vi.mocked(readOwnStayRecord).mockResolvedValue(record());
  vi.mocked(acknowledgeStayAgreement).mockResolvedValue({} as never);
  const user = userEvent.setup();
  wrap(<StayRecordPanel actorId="resident" stayId={stayId} />);
  await user.click(await screen.findByRole('button', { name: 'Review agreement policy' }));
  await user.click(screen.getByRole('button', { name: 'Show agreement text' }));
  expect(screen.getByText('Rules')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Acknowledge this agreement' }));
  await waitFor(() => expect(acknowledgeStayAgreement).toHaveBeenCalledTimes(1));
  expect(vi.mocked(acknowledgeStayAgreement).mock.calls[0]?.slice(1, 4)).toEqual([
    stayId,
    versionId,
    { version: 2, termsDigest: digest, acknowledged: true },
  ]);
});
