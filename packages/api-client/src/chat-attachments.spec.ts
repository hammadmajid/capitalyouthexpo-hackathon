import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import { downloadChatAttachment } from './chat-attachments.js';
it.each([undefined, randomUUID()])(
  'COMM-002 / SEC-003: downloads retain exact conversation, file and branch scope',
  async (branchId) => {
    const conversationId = randomUUID(),
      fileId = randomUUID(),
      response = {
        url: 'https://private.example.test/object?signature=temporary',
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      },
      fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockImplementation(async () => Response.json(response));
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      fetch,
      authentication: { kind: 'cookie', csrf: () => 'csrf' },
    });
    expect(await downloadChatAttachment(client, conversationId, fileId, branchId)).toEqual(
      response,
    );
    const request = fetch.mock.calls[0]?.[0];
    if (!(request instanceof Request)) throw new Error('Missing request');
    expect(request.url).toContain(
      (branchId ? '/branches/' + branchId : '/me') +
        '/conversations/' +
        conversationId +
        '/attachments/' +
        fileId +
        '/download',
    );
  },
);
it.each(['javascript:alert(1)', 'https://name:password@private.example.test/object'])(
  'SEC-003: unsafe attachment destinations fail closed',
  async (url) => {
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      authentication: { kind: 'cookie', csrf: () => 'csrf' },
      fetch: async () => Response.json({ url, expiresAt: new Date().toISOString() }),
    });
    await expect(downloadChatAttachment(client, randomUUID(), randomUUID())).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  },
);
