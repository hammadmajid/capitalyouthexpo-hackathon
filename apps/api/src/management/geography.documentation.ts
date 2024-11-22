import type { SchemaObject } from '@nestjs/swagger';
const identifier: SchemaObject = { type: 'string', format: 'uuid' };
export const cityDocumentation: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name'],
  properties: { id: identifier, name: { type: 'string' } },
};
export const areaDocumentation: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'cityId', 'parentId', 'level'],
  properties: {
    ...cityDocumentation.properties,
    cityId: identifier,
    parentId: { anyOf: [identifier, { type: 'null' }] },
    level: { type: 'string', enum: ['zone', 'area', 'sector', 'sub_area'] },
  },
};
