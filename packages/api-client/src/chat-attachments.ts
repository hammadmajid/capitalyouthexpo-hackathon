import { z } from 'zod';
import { downloadResponseSchema } from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
export async function downloadChatAttachment(
  client: ApiClient,
  conversation: string,
  file: string,
  branch?: string,
) {
  const conversationId = z.string().uuid().parse(conversation),
    fileId = z.string().uuid().parse(file),
    branchId = branch ? z.string().uuid().parse(branch) : undefined;
  const response = await readApi(
    branchId
      ? client.GET(
          '/v1/branches/{branchId}/conversations/{conversationId}/attachments/{fileId}/download',
          { params: { path: { branchId, conversationId, fileId } } },
        )
      : client.GET('/v1/me/conversations/{conversationId}/attachments/{fileId}/download', {
          params: { path: { conversationId, fileId } },
        }),
    downloadResponseSchema,
  );
  const url = new URL(response.url);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new ClientFailure('INVALID_RESPONSE');
  return response;
}
