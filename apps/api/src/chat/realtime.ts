import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { createHmac } from 'node:crypto';
import { Redis } from 'ioredis';
import { and, eq, isNull } from 'drizzle-orm';
import { chatMessages, listenAuthorityChanges } from '@hsm/db';
import {
  CHAT_REALTIME_CHANNEL,
  chatRealtimeEventSchema,
  chatRealtimeJoinSchema,
} from '@hsm/contracts';
import type { ApiConfig } from '../config.js';
import type { SessionService } from '../auth/session.service.js';
import type { ChatRepository } from './repository.js';
import { chatSocketToken } from './socket-auth.js';
import type { Infrastructure } from '../infrastructure.js';
type JoinReply = { joined: boolean };
interface ClientEvents {
  'conversation.join': (input: unknown, reply?: (value: JoinReply) => void) => void;
  'conversation.leave': () => void;
}
interface ServerEvents {
  'chat.message.created': (event: {
    conversationId: string;
    messageId: string;
    createdAt: string;
  }) => void;
  'chat.refresh': () => void;
}
type SocketIdentity = { token: string; userId: string; sessionId: string };
type ChatSocket = Socket<ClientEvents, ServerEvents, Record<string, never>, SocketIdentity>;
export async function startChatRealtime(
  server: HttpServer,
  repository: ChatRepository,
  sessions: Pick<SessionService, 'authenticate'>,
  config: ApiConfig,
  infrastructure: Pick<Infrastructure, 'increment'>,
) {
  const io = new Server<ClientEvents, ServerEvents, Record<string, never>, SocketIdentity>(server, {
    path: '/v1/rt',
    serveClient: false,
    maxHttpBufferSize: 16384,
    pingInterval: 5000,
    pingTimeout: 10000,
    cors: { origin: config.CORS_ORIGINS, credentials: true },
    allowRequest: (request, done) => {
      if (request.headers.origin && !config.CORS_ORIGINS.includes(request.headers.origin)) {
        done(null, false);
        return;
      }
      const digest = createHmac('sha256', config.JWT_SECRET)
        .update(request.socket.remoteAddress ?? '')
        .digest('hex');
      void infrastructure
        .increment('chat-connect:' + digest + ':' + Math.floor(Date.now() / 60000), 60)
        .then((count) => done(null, count <= 30))
        .catch(() => done(null, false));
    },
  });
  const subscriber = new Redis(config.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  subscriber.on('error', () => undefined);
  const selections = new Map<string, { conversationId: string; branchId?: string | undefined }>();
  const validating = new Set<string>();
  let authority: Awaited<ReturnType<typeof listenAuthorityChanges>> | undefined;
  async function authorize(
    socket: ChatSocket,
    target: { conversationId: string; branchId?: string | undefined },
  ) {
    const actor = await sessions.authenticate(socket.data.token);
    await repository.database.transaction((tx) =>
      repository.authorize(tx, actor, target.branchId, target.conversationId),
    );
  }
  io.use((socket, next) => {
    void (async () => {
      if (!authority?.available()) throw new Error('REALTIME_UNAVAILABLE');
      const token = chatSocketToken(
        socket.handshake.auth,
        socket.request.headers.cookie,
        ['staging', 'production'].includes(config.APP_ENV),
      );
      const actor = await sessions.authenticate(token);
      socket.data.token = token;
      socket.data.userId = actor.userId;
      socket.data.sessionId = actor.sessionId;
      next();
    })().catch(() =>
      next(new Error(authority?.available() ? 'UNAUTHENTICATED' : 'REALTIME_UNAVAILABLE')),
    );
  });
  io.on('connection', (socket) => {
    let joins = 0;
    let revision = 0;
    socket.on('conversation.join', (input, reply) => {
      const current = ++revision;
      void (async () => {
        if (++joins > 100) throw new Error('Join limit');
        const target = chatRealtimeJoinSchema.parse(input);
        await authorize(socket, target);
        if (!socket.connected || current !== revision) {
          reply?.({ joined: false });
          return;
        }
        selections.set(socket.id, target);
        reply?.({ joined: true });
      })().catch(() => {
        selections.delete(socket.id);
        reply?.({ joined: false });
        socket.disconnect(true);
      });
    });
    socket.on('conversation.leave', () => {
      revision++;
      selections.delete(socket.id);
    });
    socket.on('disconnect', () => {
      revision++;
      selections.delete(socket.id);
    });
  });
  async function broadcast(raw: string) {
    let input: unknown;
    try {
      input = JSON.parse(raw) as unknown;
    } catch {
      return;
    }
    const parsed = chatRealtimeEventSchema.safeParse(input);
    if (!parsed.success) return;
    const event = parsed.data;
    const [source] = await repository.database
      .select({ id: chatMessages.id })
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.id, event.messageId),
          eq(chatMessages.conversationId, event.conversationId),
          eq(chatMessages.createdAt, new Date(event.createdAt)),
          isNull(chatMessages.deletedAt),
        ),
      );
    if (!source) return;
    for (const socket of io.sockets.sockets.values()) {
      const target = selections.get(socket.id);
      if (!target || target.conversationId !== event.conversationId) continue;
      try {
        await authorize(socket, target);
        if (socket.connected && selections.get(socket.id) === target)
          socket.emit('chat.message.created', event);
      } catch {
        selections.delete(socket.id);
        socket.disconnect(true);
      }
    }
  }
  subscriber.on('message', (channel, raw) => {
    if (channel === CHAT_REALTIME_CHANNEL) void broadcast(raw).catch(() => undefined);
  });
  subscriber.on('ready', () => {
    void subscriber
      .subscribe(CHAT_REALTIME_CHANNEL)
      .then(() => io.emit('chat.refresh'))
      .catch(() => undefined);
  });
  const timer = setInterval(() => {
    for (const socket of io.sockets.sockets.values()) {
      if (validating.has(socket.id)) continue;
      validating.add(socket.id);
      const target = selections.get(socket.id);
      const work = target ? authorize(socket, target) : sessions.authenticate(socket.data.token);
      void work.catch(() => socket.disconnect(true)).finally(() => validating.delete(socket.id));
    }
  }, 5000);
  timer.unref();
  async function close() {
    clearInterval(timer);
    selections.clear();
    io.disconnectSockets(true);
    io.engine.close();
    subscriber.disconnect();
    await authority?.close();
  }
  try {
    authority = await listenAuthorityChanges(
      config.DATABASE_URL,
      (event) => {
        for (const socket of io.sockets.sockets.values()) {
          if (
            event.kind === 'hierarchy'
              ? Boolean(selections.get(socket.id)?.branchId)
              : event.kind === 'user'
                ? socket.data.userId === event.id
                : socket.data.sessionId === event.id
          )
            socket.disconnect(true);
        }
      },
      () => {
        io.disconnectSockets(true);
      },
    );
    await subscriber.connect();
    await subscriber.subscribe(CHAT_REALTIME_CHANNEL);
  } catch {
    await close();
    throw new Error('CHAT_REALTIME_UNAVAILABLE');
  }
  return { close };
}
