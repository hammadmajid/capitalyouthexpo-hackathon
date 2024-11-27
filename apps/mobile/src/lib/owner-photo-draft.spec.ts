import { beforeEach, expect, it, vi } from 'vitest';
import {
  clearOwnerPhotoDraft,
  keepOwnerPhotoDraft,
  readOwnerPhotoDraft,
} from './owner-photo-draft';
import * as SecureStore from 'expo-secure-store';
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));
const userId = '10000000-0000-4000-8000-000000000001';
const draft = {
  fileId: '10000000-0000-4000-8000-000000000002',
  createdAt: Date.now(),
  upload: { purpose: 'avatar', fileName: 'portrait.jpg', mimeType: 'image/jpeg', sizeBytes: 10 },
};
beforeEach(() => vi.clearAllMocks());
it('OWN-001: scan-pending metadata survives restart in actor-bound secure storage without image bytes', async () => {
  await keepOwnerPhotoDraft(userId, draft as Parameters<typeof keepOwnerPhotoDraft>[1]);
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
    'hsm.owner-photo.' + userId,
    expect.any(String),
  );
  expect(JSON.parse(vi.mocked(SecureStore.setItemAsync).mock.calls[0]?.[1] ?? '{}')).toEqual(draft);
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue(JSON.stringify(draft));
  expect(await readOwnerPhotoDraft(userId)).toEqual(draft);
  await clearOwnerPhotoDraft(userId);
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('hsm.owner-photo.' + userId);
});
it.each([
  'bad json',
  JSON.stringify({ ...draft, createdAt: 0 }),
  JSON.stringify({ ...draft, upload: { ...draft.upload, purpose: 'verification_document' } }),
])('SEC: malformed, expired or wrong-purpose metadata cannot restore an avatar', async (value) => {
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue(value);
  expect(await readOwnerPhotoDraft(userId)).toBeUndefined();
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(1);
});
