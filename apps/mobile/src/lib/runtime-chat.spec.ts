import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  restore: vi.fn(),
  read: vi.fn(),
  bind: vi.fn<
    (
      options: { accessToken: () => Promise<string | undefined> },
      actorId: string,
    ) => Promise<unknown>
  >(),
}));
vi.mock('./secure-store', () => ({ vault: { read: mocks.read } }));
vi.mock('./session', () => ({
  MobileSessionManager: class {
    restore = mocks.restore;
  },
}));
vi.mock('./actor-client', () => ({
  bindActorClient: mocks.bind,
  createActorClientBinder: () => vi.fn(),
}));
import { actorRealtimeToken } from './runtime';
const actorId = '10000000-0000-4000-8000-000000000001';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.restore.mockResolvedValue({ user: { id: actorId } });
  mocks.read.mockResolvedValue({ accessToken: 'captured-token' });
  mocks.bind.mockResolvedValue({});
});
it('COMM-001 / SEC-003: realtime credentials are frozen and independently bound to the expected account', async () => {
  mocks.bind.mockImplementation(async (options, actor) => {
    mocks.read.mockResolvedValue({ accessToken: 'replacement-account-token' });
    expect(actor).toBe(actorId);
    expect(await options.accessToken()).toBe('captured-token');
    return {};
  });
  expect(await actorRealtimeToken(actorId)).toBe('captured-token');
  expect(mocks.bind).toHaveBeenCalledOnce();
});
it.each([undefined, { user: { id: '10000000-0000-4000-8000-000000000002' } }])(
  'SEC-003: absent or changed accounts cannot open the previous account socket',
  async (profile) => {
    mocks.restore.mockResolvedValue(profile);
    await expect(actorRealtimeToken(actorId)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.bind).not.toHaveBeenCalled();
  },
);
it('SEC-003: missing stored token and failed identity verification never return socket credentials', async () => {
  mocks.read.mockResolvedValue(undefined);
  await expect(actorRealtimeToken(actorId)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  mocks.read.mockResolvedValue({ accessToken: 'unverified' });
  mocks.bind.mockRejectedValue(new Error('denied'));
  await expect(actorRealtimeToken(actorId)).rejects.toThrow('denied');
});
