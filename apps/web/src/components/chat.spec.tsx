import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ClientFailure,
  executeChatCommand,
  listOwnConversations,
  listBranchConversations,
  readChatMessages,
  subscribeChatRealtime,
} from '@hsm/api-client';
import { Chat } from './chat';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  executeChatCommand: vi.fn(),
  listOwnConversations: vi.fn(),
  listBranchConversations: vi.fn(),
  readChatMessages: vi.fn(),
  subscribeChatRealtime: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
vi.mock('./private-file-input', () => ({
  PrivateFileInput: (props: { onReady(id: string): void; onPending(pending: boolean): void }) => (
    <>
      <button onClick={() => props.onReady(fileId)}>Ready attachment</button>
      <button onClick={() => props.onPending(true)}>Pending scan</button>
    </>
  ),
}));
const actorId = '10000000-0000-4000-8000-000000000001',
  branchId = '10000000-0000-4000-8000-000000000002',
  conversationId = '10000000-0000-4000-8000-000000000003',
  fileId = '10000000-0000-4000-8000-000000000004';
const conversation = {
  id: conversationId,
  branchId,
  branchName: 'Actual Hostel',
  customerUserId: actorId,
  customerName: 'Private customer',
  lastMessageAt: null,
  createdAt: '2026-10-24T03:00:00.000Z',
  lastReadAt: null,
  unreadCount: 1,
};
function mount(element: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  return {
    client,
    ...render(<QueryClientProvider client={client}>{element}</QueryClientProvider>),
  };
}
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(executeChatCommand).mockReset().mockResolvedValue(conversation);
  vi.mocked(listOwnConversations)
    .mockReset()
    .mockResolvedValue({ data: [conversation], nextCursor: null });
  vi.mocked(listBranchConversations)
    .mockReset()
    .mockResolvedValue({ data: [conversation], nextCursor: null });
  vi.mocked(readChatMessages).mockReset().mockResolvedValue({ data: [], nextCursor: null });
  vi.mocked(subscribeChatRealtime).mockReturnValue(() => undefined);
});
async function open() {
  fireEvent.click(screen.getByText('My messages'));
  fireEvent.click(await screen.findByText('Actual Hostel — 1 unread'));
  await screen.findByText('No messages yet.');
}
it('COMM-001 / SEC-003: private conversations load lazily and failed revalidation hides cached facts', async () => {
  const { client } = mount(<Chat actorId={actorId} />);
  expect(listOwnConversations).not.toHaveBeenCalled();
  await open();
  vi.mocked(listOwnConversations).mockRejectedValue(new ClientFailure('NETWORK_UNAVAILABLE'));
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['chat', actorId] });
  });
  await waitFor(() => expect(screen.queryByText('Actual Hostel — 1 unread')).toBeNull());
  await waitFor(() => expect(screen.queryByText('No messages yet.')).toBeNull());
});
it('COMM-001 / ACC-006: uncertain send freezes navigation and retries exact body and key', async () => {
  vi.mocked(executeChatCommand)
    .mockRejectedValueOnce(new ClientFailure('NETWORK_UNAVAILABLE'))
    .mockResolvedValueOnce(conversation);
  mount(<Chat actorId={actorId} />);
  await open();
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Original message' } });
  fireEvent.click(screen.getByText('Send message'));
  await screen.findByText('Retry original message action');
  expect(screen.getByText('Close messages').hasAttribute('disabled')).toBe(true);
  expect(screen.getByLabelText('Message').hasAttribute('disabled')).toBe(true);
  const first = vi.mocked(executeChatCommand).mock.calls[0];
  fireEvent.click(screen.getByText('Retry original message action'));
  await waitFor(() => expect(executeChatCommand).toHaveBeenCalledTimes(2));
  expect(vi.mocked(executeChatCommand).mock.calls[1]).toEqual(first);
  await waitFor(() =>
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe(''),
  );
});
it('COMM-002: pending scans block sends; attachment-only commands use checked file references', async () => {
  mount(<Chat actorId={actorId} />);
  await open();
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Draft' } });
  fireEvent.click(screen.getByText('Pending scan'));
  expect(screen.getByText('Send message').hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByText('Discard pending attachment'));
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: '' } });
  fireEvent.click(screen.getByText('Ready attachment'));
  fireEvent.click(screen.getByText('Send message'));
  await waitFor(() => expect(executeChatCommand).toHaveBeenCalledOnce());
  expect(vi.mocked(executeChatCommand).mock.calls[0]?.[2]).toEqual({
    kind: 'send',
    conversationId,
    branchId: null,
    body: { attachmentFileIds: [fileId] },
  });
});
it('COMM-001 / SEC-003: staff reads exact branch scope and hides facts when branch access becomes unavailable', async () => {
  const { rerender } = mount(<Chat actorId={actorId} branchId={branchId} />);
  fireEvent.click(screen.getByText('Hostel messages'));
  await screen.findByText('Private customer — 1 unread');
  expect(listBranchConversations).toHaveBeenCalledWith(expect.anything(), branchId, {});
  expect(listOwnConversations).not.toHaveBeenCalled();
  rerender(
    <QueryClientProvider client={new QueryClient()}>
      <Chat actorId={actorId} branchId={branchId} accessUnavailable />
    </QueryClientProvider>,
  );
  expect(screen.queryByText('Private customer — 1 unread')).toBeNull();
});
it('COMM-002 / ACC-006: message reports preserve exact evidence through uncertain retry and lock navigation', async () => {
  vi.mocked(readChatMessages).mockResolvedValue({
    data: [
      {
        id: fileId,
        conversationId,
        senderUserId: actorId,
        senderName: 'Customer',
        senderSide: 'customer',
        body: 'Message requiring review',
        attachmentFileIds: [],
        createdAt: conversation.createdAt,
      },
    ],
    nextCursor: null,
  });
  vi.mocked(executeChatCommand)
    .mockRejectedValueOnce(new ClientFailure('NETWORK_UNAVAILABLE'))
    .mockResolvedValueOnce(conversation);
  mount(<Chat actorId={actorId} />);
  fireEvent.click(screen.getByText('My messages'));
  fireEvent.click(await screen.findByText('Actual Hostel — 1 unread'));
  fireEvent.click(await screen.findByText('Report this message'));
  fireEvent.change(screen.getByLabelText('Report details (optional)'), {
    target: { value: 'Specific concern' },
  });
  fireEvent.click(screen.getByText('Submit message report'));
  await screen.findByText('Retry original report');
  expect(screen.getByText('Close report').hasAttribute('disabled')).toBe(true);
  expect(screen.getByText('Close messages').hasAttribute('disabled')).toBe(true);
  const original = vi.mocked(executeChatCommand).mock.calls[0];
  expect(original?.[2]).toMatchObject({
    kind: 'report',
    conversationId,
    branchId: null,
    body: { targetId: fileId, details: 'Specific concern' },
  });
  fireEvent.click(screen.getByText('Retry original report'));
  await screen.findByText('Report submitted for review.');
  expect(vi.mocked(executeChatCommand).mock.calls[1]).toEqual(original);
});
