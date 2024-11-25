import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClientFailure, listChatReports, readChatSafetyContext } from '@hsm/api-client';
import type { SelfProfile } from '@hsm/contracts';
import { ChatSafety } from './chat-safety';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  listChatReports: vi.fn(),
  readChatSafetyContext: vi.fn(),
}));
vi.mock('./platform/admin-operations', async (original) => ({
  ...(await original<typeof import('./platform/admin-operations')>()),
  useOperationScope: (actorId: string) => ({
    key: ['platform-admin-web', actorId, 'chat-safety'],
    read: async (work: (client: object) => Promise<unknown>) => work({}),
  }),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
const actorId = '10000000-0000-4000-8000-000000000001',
  reportId = '10000000-0000-4000-8000-000000000002',
  messageId = '10000000-0000-4000-8000-000000000003';
const profile: SelfProfile = {
  user: {
    id: actorId,
    fullName: 'Safety staff',
    email: null,
    emailVerified: false,
    cnicLast4: null,
  },
  capabilities: {
    customer: false,
    owner: false,
    managerOf: [],
    admin: { isRoot: false, roles: ['support'] },
  },
};
const report = {
  id: reportId,
  reporterUserId: actorId,
  targetType: 'chat_message' as const,
  targetId: messageId,
  reason: 'harassment' as const,
  details: 'Specific incident',
  status: 'open' as const,
  createdAt: '2026-10-24T03:00:00.000Z',
};
const context = {
  reportId,
  reportedMessageId: messageId,
  messages: [
    {
      id: messageId,
      senderSide: 'customer' as const,
      body: 'Private reported evidence',
      attachmentCount: 0,
      createdAt: report.createdAt,
      removed: false,
    },
  ],
};
const caches: QueryClient[] = [];
function mount(value = profile) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  caches.push(client);
  render(
    <QueryClientProvider client={client}>
      <ChatSafety profile={value} />
    </QueryClientProvider>,
  );
  return client;
}
afterEach(() => {
  cleanup();
  for (const client of caches.splice(0)) client.clear();
});
beforeEach(() => {
  vi.mocked(listChatReports)
    .mockReset()
    .mockResolvedValue({ data: [report], nextCursor: null });
  vi.mocked(readChatSafetyContext).mockReset().mockResolvedValue(context);
});
it('COMM-002: safety metadata never implicitly opens private context; justified access is explicit', async () => {
  const client = mount();
  expect(listChatReports).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Reported chat safety cases'));
  fireEvent.click(await screen.findByText('Review reported message'));
  expect(readChatSafetyContext).not.toHaveBeenCalled();
  expect(screen.getByText('Authorize audited context access').hasAttribute('disabled')).toBe(true);
  fireEvent.change(screen.getByLabelText('Investigation justification'), {
    target: { value: 'Review this incident' },
  });
  fireEvent.click(screen.getByText('Authorize audited context access'));
  await screen.findByText('Private reported evidence');
  expect(readChatSafetyContext).toHaveBeenCalledWith(expect.anything(), reportId, {
    justification: 'Review this incident',
  });
  vi.mocked(listChatReports).mockRejectedValue(new ClientFailure('NETWORK_UNAVAILABLE'));
  await act(async () => {
    await client.refetchQueries({ queryKey: ['platform-admin-web', actorId, 'chat-safety'] });
  });
  await waitFor(() => expect(screen.queryByText('Private reported evidence')).toBeNull());
});
it('COMM-002 / SEC-003: verification-only accounts have no safety browser', () => {
  mount({
    ...profile,
    capabilities: { ...profile.capabilities, admin: { isRoot: false, roles: ['verification'] } },
  });
  expect(screen.queryByText('Reported chat safety cases')).toBeNull();
  expect(listChatReports).not.toHaveBeenCalled();
});
it('COMM-002: failed audit/access cannot display previous sensitive context or trigger automatic retries', async () => {
  vi.mocked(readChatSafetyContext).mockRejectedValue(new ClientFailure('NETWORK_UNAVAILABLE'));
  mount();
  fireEvent.click(screen.getByText('Reported chat safety cases'));
  fireEvent.click(await screen.findByText('Review reported message'));
  fireEvent.change(screen.getByLabelText('Investigation justification'), {
    target: { value: 'Review this incident' },
  });
  fireEvent.click(screen.getByText('Authorize audited context access'));
  await waitFor(() => expect(readChatSafetyContext).toHaveBeenCalledTimes(1));
  await screen.findByRole('alert');
  expect(screen.queryByText('Private reported evidence')).toBeNull();
});

it('COMM-002 SEC-003: losing browser focus clears already authorized private context', async () => {
  mount();
  fireEvent.click(screen.getByText('Reported chat safety cases'));
  fireEvent.click(await screen.findByText('Review reported message'));
  fireEvent.change(screen.getByLabelText('Investigation justification'), {
    target: { value: 'Investigating harassment report' },
  });
  fireEvent.click(screen.getByText('Authorize audited context access'));
  await screen.findByText('Private reported evidence');
  fireEvent(window, new Event('blur'));
  expect(screen.queryByText('Private reported evidence')).toBeNull();
});
