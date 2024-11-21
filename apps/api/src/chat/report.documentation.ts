import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { reportReasonSchema, reportStatusSchema } from '@hsm/contracts';
import { CookieCsrf } from '../auth/response.documentation.js';
import { identifier, nullable, object } from '../inventory/documentation.js';
const instant = { type: 'string' as const, format: 'date-time' };
export const reportInputDocumentation = object(
  {
    targetType: { type: 'string', enum: ['chat_message'] },
    targetId: identifier,
    reason: { type: 'string', enum: [...reportReasonSchema.options] },
    details: { type: 'string', minLength: 1, maxLength: 4000 },
  },
  ['details'],
);
export const reportDocumentation = object({
  id: identifier,
  reporterUserId: identifier,
  targetType: { type: 'string', enum: ['chat_message'] },
  targetId: identifier,
  reason: { type: 'string', enum: [...reportReasonSchema.options] },
  details: nullable({ type: 'string', maxLength: 4000 }),
  status: { type: 'string', enum: [...reportStatusSchema.options] },
  createdAt: instant,
});
export function ReportPaging() {
  return applyDecorators(
    ApiQuery({ name: 'cursor', required: false, schema: identifier }),
    ApiQuery({
      name: 'limit',
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    }),
    ApiQuery({ name: 'status', required: false, enum: [...reportStatusSchema.options] }),
    ApiQuery({ name: 'targetType', required: false, enum: ['chat_message'] }),
    ApiResponse({
      status: 200,
      schema: object({
        data: { type: 'array', maxItems: 100, items: reportDocumentation },
        nextCursor: nullable(identifier),
      }),
    }),
  );
}
export function SafetyContextResponse() {
  return applyDecorators(
    CookieCsrf(),
    ApiBody({
      schema: object({ justification: { type: 'string', minLength: 1, maxLength: 1000 } }),
    }),
    ApiResponse({
      status: 200,
      schema: object({
        reportId: identifier,
        reportedMessageId: identifier,
        messages: {
          type: 'array',
          minItems: 1,
          maxItems: 5,
          items: object({
            id: identifier,
            senderSide: { type: 'string', enum: ['customer', 'branch'] },
            body: nullable({ type: 'string', maxLength: 4000 }),
            attachmentCount: { type: 'integer', minimum: 0, maximum: 5 },
            createdAt: instant,
            removed: { type: 'boolean' },
          }),
        },
      }),
    }),
  );
}
