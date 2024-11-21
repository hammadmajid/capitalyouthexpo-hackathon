import { applyDecorators } from '@nestjs/common';
import { ApiResponse, type SchemaObject } from '@nestjs/swagger';
import { errorCodeSchema } from '@hsm/contracts';
export const problemDocumentation: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'title', 'status', 'code', 'detail', 'traceId'],
  properties: {
    type: { type: 'string', format: 'uri' },
    title: { type: 'string' },
    status: { type: 'integer', minimum: 400, maximum: 599 },
    code: { type: 'string', enum: [...errorCodeSchema.options] },
    detail: { type: 'string' },
    traceId: { type: 'string' },
    errors: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'code', 'message'],
        properties: {
          path: { type: 'string' },
          code: { type: 'string' },
          message: { type: 'string' },
        },
      },
    },
  },
};
export const AuthProblems = () =>
  applyDecorators(
    ...[400, 401, 403, 409, 422, 429, 500, 503].map((status) =>
      ApiResponse({
        status,
        description: 'Sanitized RFC 9457 problem with a correlation ID.',
        content: { 'application/problem+json': { schema: problemDocumentation } },
      }),
    ),
  );
