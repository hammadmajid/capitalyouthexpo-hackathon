import { z } from 'zod';
import {
  chatMessageInputSchema,
  chatMessagePageSchema,
  chatMessageSchema,
  chatPageQuerySchema,
  conversationPageSchema,
  conversationReadSchema,
  conversationSchema,
  createConversationSchema,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
function invalid(): never {
  throw new ClientFailure('INVALID_RESPONSE');
}
function queryOf(input: unknown) {
  const query = chatPageQuerySchema.parse(input);
  return { limit: query.limit, ...(query.cursor ? { cursor: query.cursor.toLowerCase() } : {}) };
}
function validatePage<T extends { data: { id: string }[]; nextCursor: string | null }>(
  value: T,
  query: ReturnType<typeof queryOf>,
  descending = false,
): T {
  let previous = query.cursor;
  for (const row of value.data) {
    if (previous && (descending ? row.id >= previous : row.id <= previous)) invalid();
    previous = row.id;
  }
  if (
    value.data.length > query.limit ||
    (value.nextCursor !== null &&
      (value.data.length !== query.limit || value.nextCursor !== previous))
  )
    invalid();
  return value;
}
export async function listOwnConversations(client: ApiClient, actor: string, input: unknown = {}) {
  const actorId = id.parse(actor),
    query = queryOf(input);
  const value = validatePage(
    await readApi(
      client.GET('/v1/me/conversations', { params: { query } }),
      conversationPageSchema,
    ),
    query,
  );
  if (value.data.some((row) => row.customerUserId !== actorId)) invalid();
  return value;
}
export async function listBranchConversations(
  client: ApiClient,
  branch: string,
  input: unknown = {},
) {
  const branchId = id.parse(branch),
    query = queryOf(input);
  const value = validatePage(
    await readApi(
      client.GET('/v1/branches/{branchId}/conversations', {
        params: { path: { branchId }, query },
      }),
      conversationPageSchema,
    ),
    query,
  );
  if (value.data.some((row) => row.branchId !== branchId)) invalid();
  return value;
}
export async function createConversation(
  client: ApiClient,
  actor: string,
  input: unknown,
  key: string,
) {
  const actorId = id.parse(actor),
    body = createConversationSchema.parse(input),
    commandKey = id.parse(key);
  const value = await readApi(
    client.POST('/v1/me/conversations', {
      body,
      params: { header: { 'Idempotency-Key': commandKey } },
    }),
    conversationSchema,
  );
  if (value.customerUserId !== actorId || value.branchId !== body.branchId) invalid();
  return value;
}
export async function readChatMessages(
  client: ApiClient,
  conversation: string,
  input: unknown = {},
  branch?: string,
) {
  const conversationId = id.parse(conversation),
    branchId = branch ? id.parse(branch) : undefined,
    query = queryOf(input);
  const operation = branchId
    ? client.GET('/v1/branches/{branchId}/conversations/{conversationId}/messages', {
        params: { path: { branchId, conversationId }, query },
      })
    : client.GET('/v1/me/conversations/{conversationId}/messages', {
        params: { path: { conversationId }, query },
      });
  const value = validatePage(await readApi(operation, chatMessagePageSchema), query, true);
  if (value.data.some((row) => row.conversationId !== conversationId)) invalid();
  return value;
}
export async function sendChatMessage(
  client: ApiClient,
  actor: string,
  conversation: string,
  input: unknown,
  key: string,
  branch?: string,
) {
  const actorId = id.parse(actor),
    conversationId = id.parse(conversation),
    branchId = branch ? id.parse(branch) : undefined,
    parsed = chatMessageInputSchema.parse(input),
    commandKey = id.parse(key);
  const body = {
      ...(parsed.body ? { body: parsed.body } : {}),
      ...(parsed.attachmentFileIds ? { attachmentFileIds: parsed.attachmentFileIds } : {}),
    },
    header = { 'Idempotency-Key': commandKey };
  const operation = branchId
    ? client.POST('/v1/branches/{branchId}/conversations/{conversationId}/messages', {
        body,
        params: { path: { branchId, conversationId }, header },
      })
    : client.POST('/v1/me/conversations/{conversationId}/messages', {
        body,
        params: { path: { conversationId }, header },
      });
  const value = await readApi(operation, chatMessageSchema);
  if (
    value.conversationId !== conversationId ||
    value.senderUserId !== actorId ||
    value.senderSide !== (branchId ? 'branch' : 'customer') ||
    value.body !== (parsed.body ?? null) ||
    JSON.stringify([...value.attachmentFileIds].sort()) !==
      JSON.stringify([...(parsed.attachmentFileIds ?? [])].sort())
  )
    invalid();
  return value;
}
export async function markChatRead(
  client: ApiClient,
  conversation: string,
  key: string,
  branch?: string,
) {
  const conversationId = id.parse(conversation),
    branchId = branch ? id.parse(branch) : undefined,
    header = { 'Idempotency-Key': id.parse(key) };
  const operation = branchId
    ? client.POST('/v1/branches/{branchId}/conversations/{conversationId}/read', {
        params: { path: { branchId, conversationId }, header },
      })
    : client.POST('/v1/me/conversations/{conversationId}/read', {
        params: { path: { conversationId }, header },
      });
  const value = await readApi(operation, conversationReadSchema);
  if (value.conversationId !== conversationId) invalid();
  return value;
}
