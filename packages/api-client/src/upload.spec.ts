import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import { ClientFailure } from './result.js';
import { readOwnFileUrl, uploadPrivateFile, waitForCleanFile, UploadFailure } from './upload.js';
const metadata = {
  purpose: 'verification_document',
  fileName: 'document.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 4,
} as const;
const body = new Blob(['test'], { type: metadata.mimeType });
function fixture() {
  const id = randomUUID(),
    requests: Request[] = [];
  const signed = {
    fileId: id,
    uploadUrl: 'https://storage.example.test/private',
    headers: { 'content-type': metadata.mimeType },
    expiresAt: new Date(Date.now() + 300000).toISOString(),
  };
  const status = { fileId: id, scanStatus: 'pending', mimeType: metadata.mimeType, sizeBytes: 4 };
  const replies: unknown[] = [signed, status, { ...status, scanStatus: 'clean' }];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    requests.push(input instanceof Request ? input : new Request(input, init));
    return Response.json(replies.shift());
  };
  const client = createApiClient({
    baseUrl: 'https://api.example.test',
    authentication: { kind: 'bearer', accessToken: async () => 'private access value' },
    fetch,
  });
  const storage = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(new Response(null, { status: 200 }));
  const pause = vi.fn(async () => undefined);
  return { client, id, signed, status, replies, requests, storage, pause };
}
it('SEC CHG-006: signed upload has no API credentials, cookies or redirects and returns only a clean owned file', async () => {
  const f = fixture();
  expect(
    await uploadPrivateFile(f.client, metadata, body, { transport: f.storage, pause: f.pause }),
  ).toBe(f.id);
  expect(f.storage).toHaveBeenCalledExactlyOnceWith(f.signed.uploadUrl, {
    method: 'PUT',
    body,
    headers: new Headers(f.signed.headers),
    credentials: 'omit',
    redirect: 'error',
  });
  const headers = f.storage.mock.calls[0]?.[1]?.headers;
  expect(new Headers(headers).has('authorization')).toBe(false);
  expect(f.requests.map((r) => new URL(r.url).pathname)).toEqual([
    '/v1/files/uploads',
    '/v1/files/' + f.id + '/complete',
    '/v1/files/' + f.id,
  ]);
  expect(
    f.requests.every((r) => r.headers.get('authorization') === 'Bearer private access value'),
  ).toBe(true);
});
it('SEC: already clean completion does not poll or upload twice', async () => {
  const f = fixture();
  f.replies[1] = { ...f.status, scanStatus: 'clean' };
  expect(await uploadPrivateFile(f.client, metadata, body, { transport: f.storage })).toBe(f.id);
  expect(f.requests).toHaveLength(2);
});
it.each([
  new Blob(['wrong'], { type: metadata.mimeType }),
  new Blob(['test'], { type: 'text/plain' }),
])('SEC: inconsistent local file metadata never requests a signed upload', async (bytes) => {
  const f = fixture();
  await expect(uploadPrivateFile(f.client, metadata, bytes)).rejects.toBeInstanceOf(ClientFailure);
  expect(f.requests).toHaveLength(0);
});
it.each([
  { expiresAt: new Date(0).toISOString() },
  { uploadUrl: 'file:///private/document.pdf' },
  { uploadUrl: 'https://identity:secret@storage.example.test/private' },
  { headers: { authorization: 'private bearer value', 'content-type': metadata.mimeType } },
  { headers: { cookie: 'private cookie value', 'content-type': metadata.mimeType } },
  { headers: { 'content-type': 'text/plain' } },
])(
  'SEC: untrusted storage capabilities cannot carry credentials or unsupported targets',
  async (change) => {
    const f = fixture();
    f.replies[0] = { ...f.signed, ...change };
    await expect(
      uploadPrivateFile(f.client, metadata, body, { transport: f.storage }),
    ).rejects.toBeInstanceOf(ClientFailure);
    expect(f.storage).not.toHaveBeenCalled();
  },
);
it.each(['throw', 'failure'] as const)(
  'SEC: storage %s is safely classified without completing the file',
  async (mode) => {
    const f = fixture();
    if (mode === 'throw') f.storage.mockRejectedValueOnce(new Error('private storage signature'));
    else f.storage.mockResolvedValueOnce(new Response(null, { status: 403 }));
    await expect(
      uploadPrivateFile(f.client, metadata, body, { transport: f.storage }),
    ).rejects.toMatchObject({ code: 'NETWORK_UNAVAILABLE', message: 'Connection unavailable' });
    expect(f.requests).toHaveLength(1);
  },
);
it.each([{ fileId: randomUUID() }, { mimeType: 'image/png' }, { sizeBytes: 5 }])(
  'SEC: a changed file snapshot cannot become a profile document',
  async (change) => {
    const f = fixture();
    f.replies[1] = { ...f.status, ...change, scanStatus: 'clean' };
    await expect(
      uploadPrivateFile(f.client, metadata, body, { transport: f.storage }),
    ).rejects.toBeInstanceOf(ClientFailure);
  },
);
it('SEC: rejected scans never return accepted file IDs', async () => {
  const f = fixture();
  f.replies[1] = { ...f.status, scanStatus: 'rejected' };
  await expect(
    uploadPrivateFile(f.client, metadata, body, { transport: f.storage }),
  ).rejects.toMatchObject({ code: 'REJECTED', fileId: f.id });
});
it('SEC: pending scan is bounded and can be resumed without re-uploading', async () => {
  const f = fixture();
  f.replies.splice(0, f.replies.length, ...Array.from({ length: 20 }, () => f.status));
  await expect(
    waitForCleanFile(f.client, f.id, metadata, { pause: f.pause }),
  ).rejects.toMatchObject({ code: 'PENDING', fileId: f.id });
  expect(f.requests).toHaveLength(20);
  expect(f.pause).toHaveBeenCalledTimes(19);
  f.replies.push({ ...f.status, scanStatus: 'clean' });
  expect(await waitForCleanFile(f.client, f.id, metadata)).toBe(f.id);
  expect(f.storage).not.toHaveBeenCalled();
});
it('SEC: the native transport and real delay remain usable without custom dependencies', async () => {
  const f = fixture();
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(null, { status: 200 }));
  f.replies[2] = f.status;
  f.replies.push({ ...f.status, scanStatus: 'clean' });
  try {
    const operation = uploadPrivateFile(f.client, metadata, body);

    expect(await operation).toBe(f.id);
    expect(fetch).toHaveBeenCalledTimes(1);
  } finally {
    fetch.mockRestore();
  }
});
it('SEC: pending and rejected errors expose only fixed safe messages', () => {
  expect(new UploadFailure('PENDING', randomUUID()).message).toBe('File scan is still pending');
  expect(new UploadFailure('REJECTED', randomUUID()).message).toBe('File rejected');
});
it('SEC-003: own-file preview reads a signed URL for the exact file and rejects other schemes', async () => {
  const id = randomUUID(),
    requests: string[] = [];
  const reply = (url: string) =>
    createApiClient({
      baseUrl: 'https://api.example.test',
      authentication: { kind: 'bearer', accessToken: async () => 'private access value' },
      fetch: async (input) => {
        requests.push(input instanceof Request ? input.url : String(input));
        return Response.json({ url, expiresAt: new Date(Date.now() + 60000).toISOString() });
      },
    });
  await expect(readOwnFileUrl(reply('https://storage.example.test/a'), id)).resolves.toMatchObject({
    url: 'https://storage.example.test/a',
  });
  expect(requests[0]).toBe('https://api.example.test/v1/files/' + id + '/download');
  await expect(readOwnFileUrl(reply('ftp://storage.example.test/a'), id)).rejects.toBeInstanceOf(
    ClientFailure,
  );
  await expect(readOwnFileUrl(reply('https://x.test/a'), 'not-a-uuid')).rejects.toThrow();
});
