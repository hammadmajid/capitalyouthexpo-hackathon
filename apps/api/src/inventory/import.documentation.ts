import { object, identifier, nullable } from './documentation.js';
const kind = { type: 'string' as const, enum: ['rooms', 'seats'] },
  text = { type: 'string' as const },
  count = { type: 'integer' as const, minimum: 0, maximum: 500 };
export const importInputDocumentation = object({ kind, fileId: identifier });
export const importIdentityDocumentation = object({ id: identifier, branchId: identifier });
export const importTemplateDocumentation = object({
  branchId: identifier,
  kind,
  fileName: text,
  csv: text,
});
export const importPreviewDocumentation = object({
  id: identifier,
  branchId: identifier,
  kind,
  status: { type: 'string', enum: ['validated', 'failed', 'committed'] },
  totalRows: count,
  errorRows: count,
  createdAt: { type: 'string', format: 'date-time' },
  committedAt: nullable({ type: 'string', format: 'date-time' }),
  rows: {
    type: 'array',
    maxItems: 100,
    items: object({
      recordNumber: { type: 'integer', minimum: 2, maximum: 501 },
      roomTypeId: nullable(text),
      roomNumber: text,
      bedLabel: nullable(text),
      errors: { type: 'array', items: text },
    }),
  },
  nextOffset: nullable(count),
});
