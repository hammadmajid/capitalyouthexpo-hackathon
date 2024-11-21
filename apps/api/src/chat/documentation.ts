import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiQuery, ApiResponse } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger';
import { CookieCsrf } from '../auth/response.documentation.js';
import { identifier, nullable, object } from '../inventory/documentation.js';
const instant: SchemaObject = { type: 'string', format: 'date-time' };
const name: SchemaObject = { type: 'string', minLength: 1, maxLength: 200 };
export const conversationDocumentation = object({
  id: identifier,
  branchId: identifier,
  branchName: name,
  customerUserId: identifier,
  customerName: name,
  lastMessageAt: nullable(instant),
  createdAt: instant,
  lastReadAt: nullable(instant),
  unreadCount: { type: 'integer', minimum: 0 },
});
export const messageDocumentation = object({
  id: identifier,
  conversationId: identifier,
  senderUserId: identifier,
  senderName: name,
  senderSide: { type: 'string', enum: ['customer', 'branch'] },
  body: nullable({ type: 'string', minLength: 1, maxLength: 4000 }),
  attachmentFileIds: { type: 'array', maxItems: 5, uniqueItems: true, items: identifier },
  createdAt: instant,
});
export const messageInputDocumentation = object(
  {
    body: { type: 'string', minLength: 1, maxLength: 4000 },
    attachmentFileIds: {
      type: 'array',
      minItems: 1,
      maxItems: 5,
      uniqueItems: true,
      items: identifier,
    },
  },
  ['body', 'attachmentFileIds'],
);
export const readDocumentation = object({ conversationId: identifier, lastReadAt: instant });
export function ChatPaging(messages = false) {
  return applyDecorators(
    ApiQuery({ name: 'cursor', required: false, schema: identifier }),
    ApiQuery({
      name: 'limit',
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    }),
    ApiResponse({
      status: 200,
      schema: object({
        data: {
          type: 'array',
          maxItems: 100,
          items: messages ? messageDocumentation : conversationDocumentation,
        },
        nextCursor: nullable(identifier),
      }),
    }),
  );
}
export function ChatMutation(input: SchemaObject | undefined, result: SchemaObject, status = 200) {
  return applyDecorators(
    CookieCsrf(),
    ApiHeader({ name: 'Idempotency-Key', required: true, schema: identifier }),
    ...(input ? [ApiBody({ schema: input })] : []),
    ApiResponse({ status, schema: result }),
  );
}
