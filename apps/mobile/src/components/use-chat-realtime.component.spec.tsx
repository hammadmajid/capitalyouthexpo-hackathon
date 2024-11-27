import { act, cleanup, render, screen, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { subscribeChatRealtime } from '@hsm/api-client';
import { actorRealtimeToken } from '../lib/runtime';
import { useChatRealtime } from './use-chat-realtime';
import { Copy } from './ui';
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  subscribeChatRealtime: jest.fn(),
}));
jest.mock('../lib/runtime', () => ({
  actorRealtimeToken: jest.fn(),
  config: { apiUrl: 'https://api.example.test' },
}));
let change: ((state: AppStateStatus) => void) | undefined;
const stop = jest.fn(),
  remove = jest.fn();
const actorId = '10000000-0000-4000-8000-000000000001',
  conversationId = '10000000-0000-4000-8000-000000000003';
function Probe() {
  const { state } = useChatRealtime(actorId, conversationId);
  return <Copy>{state}</Copy>;
}
async function mount() {
  await render(
    <QueryClientProvider client={new QueryClient()}>
      <Probe />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(actorRealtimeToken).mockReset().mockResolvedValue('verified-token');
  jest.mocked(subscribeChatRealtime).mockReturnValue(stop);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    change = listener;
    return { remove };
  });
});
afterEach(async () => {
  await cleanup();
  jest.restoreAllMocks();
  change = undefined;
});
it('COMM-001 / SEC-003: foreground reconnect binds credentials again and background stops delivery', async () => {
  await mount();
  await waitFor(() => expect(subscribeChatRealtime).toHaveBeenCalledTimes(1));
  expect(subscribeChatRealtime).toHaveBeenCalledWith(
    expect.objectContaining({ conversationId, token: 'verified-token', browser: false }),
  );
  await act(async () => {
    change?.('background');
  });
  expect(stop).toHaveBeenCalledTimes(1);
  await act(async () => {
    change?.('active');
  });
  await waitFor(() => expect(actorRealtimeToken).toHaveBeenCalledTimes(2));
  expect(subscribeChatRealtime).toHaveBeenCalledTimes(2);
});
it('SEC-003: a credential lookup completing after background/unmount cannot open a stale account socket', async () => {
  let resolve: ((token: string) => void) | undefined;
  jest.mocked(actorRealtimeToken).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  await mount();
  await act(async () => {
    change?.('background');
    resolve?.('late-token');
  });
  expect(subscribeChatRealtime).not.toHaveBeenCalled();
  await cleanup();
  expect(remove).toHaveBeenCalled();
});
it('SEC-003: failed account binding denies realtime access', async () => {
  jest.mocked(actorRealtimeToken).mockRejectedValue(new Error('denied'));
  await mount();
  await screen.findByText('denied');
  expect(subscribeChatRealtime).not.toHaveBeenCalled();
});
