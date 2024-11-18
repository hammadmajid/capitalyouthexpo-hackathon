import { io } from 'socket.io-client';
import { chatRealtimeEventSchema, chatRealtimeJoinSchema } from '@hsm/contracts';
export type ChatRealtimeState = 'connecting' | 'connected' | 'disconnected' | 'denied';
export function subscribeChatRealtime(options: {
  url: string;
  path: string;
  conversationId: string;
  branchId?: string | undefined;
  token?: string | undefined;
  browser: boolean;
  refresh(): void;
  state(value: ChatRealtimeState): void;
}) {
  const target = chatRealtimeJoinSchema.parse({
    conversationId: options.conversationId,
    ...(options.branchId ? { branchId: options.branchId } : {}),
  });
  const socket = io(options.url, {
    path: options.path,
    transports: options.browser ? ['polling'] : ['websocket'],
    withCredentials: options.browser,
    auth: options.token ? { token: options.token } : {},
    autoConnect: false,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });
  let closed = false;
  const refresh = () => {
    if (!closed) options.refresh();
  };
  socket.on('connect', () => {
    socket
      .timeout(10000)
      .emit('conversation.join', target, (error: Error | null, answer: unknown) => {
        if (closed) return;
        if (error) {
          options.state('disconnected');
          socket.disconnect();
          return;
        }
        if (
          !answer ||
          typeof answer !== 'object' ||
          !('joined' in answer) ||
          answer.joined !== true
        ) {
          options.state('denied');
          socket.disconnect();
          return;
        }
        options.state('connected');
        refresh();
      });
  });
  socket.on('chat.message.created', (input: unknown) => {
    const event = chatRealtimeEventSchema.safeParse(input);
    if (event.success && event.data.conversationId === target.conversationId) refresh();
  });
  socket.on('chat.refresh', refresh);
  socket.on('disconnect', () => {
    if (!closed) options.state('disconnected');
  });
  socket.on('connect_error', (error: Error) => {
    if (closed) return;
    options.state(error.message === 'UNAUTHENTICATED' ? 'denied' : 'disconnected');
    if (error.message === 'UNAUTHENTICATED') socket.disconnect();
  });
  options.state('connecting');
  socket.connect();
  return () => {
    closed = true;
    socket.removeAllListeners();
    socket.disconnect();
  };
}
