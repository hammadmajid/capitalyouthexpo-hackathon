import { z } from 'zod';
import {
  chatReportInputSchema,
  chatReportPageQuerySchema,
  chatReportPageSchema,
  chatReportSchema,
  chatSafetyAccessSchema,
  chatSafetyContextSchema,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export async function reportChatMessage(
  client: ApiClient,
  actor: string,
  input: unknown,
  key: string,
  branch?: string,
  conversation?: string,
) {
  const actorId = id.parse(actor),
    parsed = chatReportInputSchema.parse(input),
    header = { 'Idempotency-Key': id.parse(key) },
    branchId = branch ? id.parse(branch) : undefined,
    conversationId = conversation ? id.parse(conversation) : undefined;
  const body = {
    targetType: parsed.targetType,
    targetId: parsed.targetId,
    reason: parsed.reason,
    ...(parsed.details !== undefined ? { details: parsed.details } : {}),
  };
  if (Boolean(branchId) !== Boolean(conversationId)) throw new ClientFailure('INVALID_RESPONSE');
  const result = await readApi(
    branchId && conversationId
      ? client.POST('/v1/branches/{branchId}/conversations/{conversationId}/reports', {
          body,
          params: { path: { branchId, conversationId }, header },
        })
      : client.POST('/v1/me/reports', { body, params: { header } }),
    chatReportSchema,
  );
  if (
    result.reporterUserId !== actorId ||
    result.targetType !== body.targetType ||
    result.targetId !== body.targetId ||
    result.reason !== body.reason ||
    result.details !== (body.details ?? null) ||
    result.status !== 'open'
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export async function listChatReports(client: ApiClient, input: unknown = {}) {
  const parsed = chatReportPageQuerySchema.parse(input),
    query = {
      limit: parsed.limit,
      ...(parsed.cursor ? { cursor: parsed.cursor.toLowerCase() } : {}),
      ...(parsed.status ? { status: parsed.status } : {}),
      targetType: 'chat_message' as const,
    };
  const result = await readApi(
    client.GET('/v1/admin/reports', { params: { query } }),
    chatReportPageSchema,
  );
  let previous = query.cursor;
  for (const row of result.data) {
    if ((previous && row.id <= previous) || (query.status && row.status !== query.status))
      throw new ClientFailure('INVALID_RESPONSE');
    previous = row.id;
  }
  if (
    result.data.length > query.limit ||
    (result.nextCursor !== null &&
      (result.data.length !== query.limit || result.nextCursor !== previous))
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export async function readChatSafetyContext(client: ApiClient, report: string, input: unknown) {
  const reportId = id.parse(report),
    body = chatSafetyAccessSchema.parse(input);
  const result = await readApi(
    client.POST('/v1/admin/reports/{reportId}/chat-context', {
      body,
      params: { path: { reportId } },
    }),
    chatSafetyContextSchema,
  );
  if (result.reportId !== reportId) throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
