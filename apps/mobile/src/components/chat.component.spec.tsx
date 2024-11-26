import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ClientFailure,
  executeChatCommand,
  listOwnConversations,
  listBranchConversations,
  readChatMessages,
} from '@hsm/api-client';
import { Chat } from './chat';
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  executeChatCommand: jest.fn(),
  listOwnConversations: jest.fn(),
  listBranchConversations: jest.fn(),
  readChatMessages: jest.fn(),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => '10000000-0000-4000-8000-000000000005' }));
jest.mock('../lib/runtime', () => ({ actorClient: async () => ({}) }));
jest.mock('./use-chat-realtime', () => ({
  useChatRealtime: () => ({ state: 'connected', reconnect: jest.fn() }),
}));
jest.mock('./private-file-picker', () => {
  const { Button } = jest.requireActual<typeof import('./ui')>('./ui');
  return {
    PrivateFilePicker: (props: {
      onReady(id: string): void;
      onPending(pending: boolean): void;
    }) => (
      <>
        <Button
          label="Ready attachment"
          onPress={() => props.onReady('10000000-0000-4000-8000-000000000004')}
        />
        <Button label="Pending scan" onPress={() => props.onPending(true)} />
      </>
    ),
  };
});
const actorId = '10000000-0000-4000-8000-000000000001',
  branchId = '10000000-0000-4000-8000-000000000002',
  conversationId = '10000000-0000-4000-8000-000000000003',
  fileId = '10000000-0000-4000-8000-000000000004',
  hostelUser = '10000000-0000-4000-8000-000000000006';
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
const caches: QueryClient[] = [];
async function mount(element: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  caches.push(client);
  await render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
  return client;
}
afterEach(async () => {
  await cleanup();
  for (const client of caches.splice(0)) client.clear();
});
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(executeChatCommand).mockReset().mockResolvedValue(conversation);
  jest
    .mocked(listOwnConversations)
    .mockReset()
    .mockResolvedValue({ data: [conversation], nextCursor: null });
  jest
    .mocked(listBranchConversations)
    .mockReset()
    .mockResolvedValue({ data: [conversation], nextCursor: null });
  jest.mocked(readChatMessages).mockReset().mockResolvedValue({ data: [], nextCursor: null });
});
async function open() {
  await fireEvent.press(await screen.findByLabelText('Actual Hostel, 1 unread'));
  await screen.findByText('No messages yet');
}
it('COMM-001 / SEC-003: the inbox opens at once and hides private facts after failed revalidation', async () => {
  const client = await mount(<Chat actorId={actorId} />);
  await open();
  await fireEvent.press(screen.getByLabelText('Back to messages'));
  await screen.findByLabelText('Actual Hostel, 1 unread');
  jest.mocked(listOwnConversations).mockRejectedValue(new ClientFailure('NETWORK_UNAVAILABLE'));
  await act(async () => {
    await client.refetchQueries({ queryKey: ['chat', actorId] });
  });
  await waitFor(() => expect(screen.queryByLabelText('Actual Hostel, 1 unread')).toBeNull());
});
it('COMM-001 / ACC-006: native uncertain sends retain the original key/body and block replacement', async () => {
  jest
    .mocked(executeChatCommand)
    .mockRejectedValueOnce(new ClientFailure('NETWORK_UNAVAILABLE'))
    .mockResolvedValueOnce(conversation);
  await mount(<Chat actorId={actorId} />);
  await open();
  await fireEvent.changeText(screen.getByLabelText('Message'), 'Original native message');
  await fireEvent.press(screen.getByLabelText('Send message'));
  await screen.findByText('Retry original message action');
  expect(screen.getByLabelText('Message').props.editable).toBe(false);
  const first = jest.mocked(executeChatCommand).mock.calls[0];
  // Back waits while the send is uncertain, so the retry cannot be lost.
  await fireEvent.press(screen.getByLabelText('Back to messages'));
  expect(screen.getByText('Retry original message action')).toBeTruthy();
  await fireEvent.press(screen.getByText('Retry original message action'));
  await waitFor(() => expect(executeChatCommand).toHaveBeenCalledTimes(2));
  expect(jest.mocked(executeChatCommand).mock.calls[1]).toEqual(first);
  await waitFor(() => expect(screen.getByLabelText('Message').props.value).toBe(''));
});
it('COMM-002: native pending scan blocks sending and checked attachment-only sends preserve the file ID', async () => {
  await mount(<Chat actorId={actorId} />);
  await open();
  await fireEvent.changeText(screen.getByLabelText('Message'), 'Draft');
  await fireEvent.press(screen.getByText('Pending scan'));
  await fireEvent.press(screen.getByLabelText('Send message'));
  expect(executeChatCommand).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByLabelText('Discard pending attachment'));
  await fireEvent.changeText(screen.getByLabelText('Message'), '');
  await fireEvent.press(screen.getByText('Ready attachment'));
  await fireEvent.press(screen.getByLabelText('Send message'));
  await waitFor(() => expect(executeChatCommand).toHaveBeenCalledTimes(1));
  expect(jest.mocked(executeChatCommand).mock.calls[0]?.[2]).toEqual({
    kind: 'send',
    conversationId,
    branchId: null,
    body: { attachmentFileIds: [fileId] },
  });
});
it('COMM-001 / SEC-003: native staff list uses the exact selected branch', async () => {
  await mount(<Chat actorId={actorId} branchId={branchId} />);
  await screen.findByLabelText('Private customer, 1 unread');
  expect(listBranchConversations).toHaveBeenCalledWith(expect.anything(), branchId, {});
  expect(listOwnConversations).not.toHaveBeenCalled();
});
it('COMM-002 / ACC-006: native reports preserve exact evidence through uncertain retry', async () => {
  jest.mocked(readChatMessages).mockResolvedValue({
    data: [
      {
        id: fileId,
        conversationId,
        senderUserId: hostelUser,
        senderName: 'Hostel desk',
        senderSide: 'branch',
        body: 'Message requiring review',
        attachmentFileIds: [],
        createdAt: conversation.createdAt,
      },
    ],
    nextCursor: null,
  });
  // The first report attempt is uncertain; the automatic read receipt always succeeds.
  let failed = false;
  jest.mocked(executeChatCommand).mockImplementation(async (_client, _actor, command) => {
    if (command.kind === 'report' && !failed) {
      failed = true;
      throw new ClientFailure('NETWORK_UNAVAILABLE');
    }
    return conversation;
  });
  const reports = () =>
    jest.mocked(executeChatCommand).mock.calls.filter((call) => call[2].kind === 'report');
  await mount(<Chat actorId={actorId} />);
  await fireEvent.press(await screen.findByLabelText('Actual Hostel, 1 unread'));
  await fireEvent.press(await screen.findByLabelText('Report this message'));
  await fireEvent.changeText(screen.getByLabelText('Report details'), 'Specific concern');
  await fireEvent.press(screen.getByText('Submit message report'));
  await screen.findByText('Retry original report');
  const original = reports()[0];
  expect(original?.[2]).toMatchObject({
    kind: 'report',
    conversationId,
    branchId: null,
    body: { targetId: fileId, details: 'Specific concern' },
  });
  await fireEvent.press(screen.getByLabelText('Back to messages'));
  expect(screen.getByText('Retry original report')).toBeTruthy();
  await fireEvent.press(screen.getByText('Retry original report'));
  await screen.findByText('Report submitted for review.');
  expect(reports()[1]).toEqual(original);
});
it('COMM-001: opening a conversation with a new hostel message marks it read once, with no button', async () => {
  jest.mocked(readChatMessages).mockResolvedValue({
    data: [
      {
        id: fileId,
        conversationId,
        senderUserId: hostelUser,
        senderName: 'Hostel desk',
        senderSide: 'branch',
        body: 'Welcome',
        attachmentFileIds: [],
        createdAt: conversation.createdAt,
      },
    ],
    nextCursor: null,
  });
  await mount(<Chat actorId={actorId} />);
  await fireEvent.press(await screen.findByLabelText('Actual Hostel, 1 unread'));
  await screen.findByText('Welcome');
  await waitFor(() =>
    expect(executeChatCommand).toHaveBeenCalledWith(
      expect.anything(),
      actorId,
      { kind: 'read', conversationId, branchId: null },
      expect.any(String),
    ),
  );
  expect(screen.queryByText('Mark conversation read')).toBeNull();
});
