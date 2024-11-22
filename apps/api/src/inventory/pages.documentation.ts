import { inventoryPermissionSchema } from '@hsm/contracts';
import {
  object,
  identifier,
  nullable,
  money,
  typeSummaryDocumentation,
  roomInputDocumentation,
  seatInputDocumentation,
} from './documentation.js';
const access = {
  branchId: identifier,
  permissions: {
    type: 'array' as const,
    maxItems: inventoryPermissionSchema.options.length,
    uniqueItems: true,
    items: { type: 'string' as const, enum: [...inventoryPermissionSchema.options] },
  },
  canConfigureManagers: { type: 'boolean' as const },
};
export const inventoryAccessDocumentation = object(access);
const archivedAt = nullable({ type: 'string', format: 'date-time' });
export const inventoryTypePageDocumentation = object({
  ...access,
  data: {
    type: 'array',
    maxItems: 100,
    items: object(
      {
        ...typeSummaryDocumentation,
        id: identifier,
        branchId: identifier,
        archivedAt,
      },
      ['setupManaged'],
    ),
  },
  nextCursor: nullable(identifier),
});
export const inventoryRoomPageDocumentation = object({
  ...access,
  roomTypeId: identifier,
  data: {
    type: 'array',
    maxItems: 100,
    items: object({
      ...roomInputDocumentation.properties,
      capacity: { type: 'integer', minimum: 0 },
      id: identifier,
      branchId: identifier,
      archivedAt,
    }),
  },
  nextCursor: nullable(identifier),
});
export const inventorySeatPageDocumentation = object({
  ...access,
  roomId: identifier,
  data: {
    type: 'array',
    maxItems: 100,
    items: object(
      {
        ...seatInputDocumentation.properties,
        monthlyRentPaisa: nullable(money),
        id: identifier,
        roomId: identifier,
        ordinal: { type: 'integer', minimum: 1 },
        archivedAt,
      },
      ['monthlyRentPaisa', 'depositPaisa'],
    ),
  },
  nextCursor: nullable(identifier),
});
