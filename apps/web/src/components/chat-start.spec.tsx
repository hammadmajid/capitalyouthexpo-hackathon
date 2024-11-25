import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClientFailure, executeChatCommand } from '@hsm/api-client';
import { ChatStart } from './chat-start';
const mock = vi.hoisted(() => ({ signedIn: true, customer: true }));
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  executeChatCommand: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
vi.mock('./providers', () => ({
  useSession: () => ({
    isPending: false,
    error: null,
    data: mock.signedIn
      ? { user: { id: actorId }, capabilities: { customer: mock.customer } }
      : undefined,
  }),
}));
vi.mock('./chat', () => ({
  Chat: ({ initialConversationId }: { initialConversationId: string }) => (
    <p>Opened {initialConversationId}</p>
  ),
}));
const actorId = '10000000-0000-4000-8000-000000000001',
  branchId = '10000000-0000-4000-8000-000000000002',
  conversationId = '10000000-0000-4000-8000-000000000003';
const conversation = {
  id: conversationId,
  branchId,
  branchName: 'Hostel',
  customerUserId: actorId,
  customerName: 'Customer',
  lastMessageAt: null,
  createdAt: '2026-10-24T03:00:00.000Z',
  lastReadAt: null,
  unreadCount: 0,
};
function mount() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ChatStart branchId={branchId} />
    </QueryClientProvider>,
  );
}
afterEach(cleanup);
beforeEach(() => {
  mock.signedIn = true;
  mock.customer = true;
  vi.mocked(executeChatCommand).mockReset().mockResolvedValue(conversation);
});
it('COMM-001 / SEC-003: listing entry points require sign-in and the current Customer capability', () => {
  mock.signedIn = false;
  mount();
  expect(screen.getByText('Sign in to message this hostel').getAttribute('href')).toContain(
    '/login',
  );
  expect(executeChatCommand).not.toHaveBeenCalled();
  cleanup();
  mock.signedIn = true;
  mock.customer = false;
  mount();
  expect(screen.getByText('Complete your Customer profile to message this hostel')).toBeTruthy();
  expect(executeChatCommand).not.toHaveBeenCalled();
});
it('COMM-001 / ACC-006: uncertain conversation creation retries its original branch/key before opening', async () => {
  vi.mocked(executeChatCommand)
    .mockRejectedValueOnce(new ClientFailure('NETWORK_UNAVAILABLE'))
    .mockResolvedValueOnce(conversation);
  mount();
  fireEvent.click(screen.getByText('Message this hostel'));
  await screen.findByText('Retry original conversation request');
  const original = vi.mocked(executeChatCommand).mock.calls[0];
  expect(screen.getByText('Message this hostel').hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByText('Retry original conversation request'));
  await waitFor(() => expect(executeChatCommand).toHaveBeenCalledTimes(2));
  expect(vi.mocked(executeChatCommand).mock.calls[1]).toEqual(original);
  await screen.findByText('Opened ' + conversationId);
});
