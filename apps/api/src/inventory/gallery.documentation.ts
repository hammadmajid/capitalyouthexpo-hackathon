import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiResponse, type SchemaObject } from '@nestjs/swagger';
import { CookieCsrf } from '../auth/response.documentation.js';
import { problemDocumentation } from '../auth/problem.documentation.js';
import { identifier, nullable, object } from './documentation.js';
const fields = {
  altText: { type: 'string', minLength: 1, maxLength: 240 },
  sortOrder: { type: 'integer', minimum: 0, maximum: 2147483647 },
} satisfies Record<string, SchemaObject>;
const galleryTargetDocumentation: SchemaObject = {
  oneOf: [
    object({ kind: { type: 'string', enum: ['room'] }, roomId: identifier }),
    object({ kind: { type: 'string', enum: ['bed'] }, roomId: identifier, bedId: identifier }),
  ],
};
export const galleryAttachDocumentation = object(
  { ...fields, fileId: identifier, target: galleryTargetDocumentation },
  ['target'],
);
export const galleryEditDocumentation = object({ ...fields, published: { type: 'boolean' } });
export const galleryArchiveDocumentation = object({
  reason: { type: 'string', minLength: 1, maxLength: 500 },
});
export const galleryMediaDocumentation = object({
  ...fields,
  id: identifier,
  branchId: identifier,
  fileId: identifier,
  roomId: nullable(identifier),
  bedId: nullable(identifier),
  publishedAt: nullable({ type: 'string', format: 'date-time' }),
  archivedAt: nullable({ type: 'string', format: 'date-time' }),
  scanStatus: { type: 'string', enum: ['pending', 'clean', 'rejected'] },
  version: { type: 'string', pattern: '^[a-f0-9]{64}$' },
});
export const galleryPageDocumentation = object({
  data: { type: 'array', maxItems: 100, items: galleryMediaDocumentation },
  nextCursor: nullable(identifier),
  canEdit: { type: 'boolean' },
  canPublish: { type: 'boolean' },
});
export function GalleryCommand(schema: SchemaObject, status: 200 | 201 = 200, version = true) {
  return applyDecorators(
    CookieCsrf(),
    ApiBody({ schema }),
    ApiHeader({
      name: 'Idempotency-Key',
      required: true,
      schema: { type: 'string', format: 'uuid' },
    }),
    ...(version
      ? [
          ApiHeader({
            name: 'If-Match',
            required: true,
            schema: { type: 'string', pattern: '^"[a-f0-9]{64}"$' },
          }),
        ]
      : []),
    ApiResponse({
      status,
      schema: galleryMediaDocumentation,
      headers: { ETag: { schema: { type: 'string' } } },
    }),
    ApiResponse({
      status: 412,
      description: 'PRECONDITION_FAILED: image changed; refresh its current state.',
      content: { 'application/problem+json': { schema: problemDocumentation } },
    }),
  );
}
