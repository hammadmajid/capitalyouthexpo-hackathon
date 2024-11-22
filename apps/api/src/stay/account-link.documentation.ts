import { identifier, nullable, object } from '../inventory/documentation.js';
export const accountLinkPageDocumentation = object({
  data: {
    type: 'array',
    maxItems: 50,
    items: object({
      id: identifier,
      residentId: identifier,
      residentName: { type: 'string' },
      customerName: { type: 'string' },
      phone: { type: 'string' },
      createdAt: { type: 'string', format: 'date-time' },
    }),
  },
  nextCursor: nullable(identifier),
});
