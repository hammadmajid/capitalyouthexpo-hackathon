import type { SchemaObject } from '@nestjs/swagger';
import { object, identifier } from './documentation.js';
export const duplicationInputDocumentation: SchemaObject = {
  oneOf: [
    object({
      roomNumbers: {
        type: 'array',
        minItems: 1,
        maxItems: 100,
        uniqueItems: true,
        items: { type: 'string', minLength: 1, maxLength: 80 },
      },
    }),
    object({
      from: { type: 'integer', minimum: 0, maximum: 999999 },
      to: { type: 'integer', minimum: 0, maximum: 999999 },
    }),
  ],
};
export const duplicationResultDocumentation = object({
  branchId: identifier,
  sourceRoomId: identifier,
  roomIds: { type: 'array', minItems: 1, maxItems: 100, uniqueItems: true, items: identifier },
});
